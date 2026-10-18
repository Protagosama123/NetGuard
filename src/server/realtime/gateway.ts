import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import type { Socket } from 'node:net';
import { AuthService, type TokenPayload } from '../auth/auth.service.ts';
import type { UserRole } from '../../db/schema.ts';

export type RealtimeEventType =
  | 'alert:created'
  | 'alert:status_changed'
  | 'incident:created'
  | 'incident:status_changed'
  | 'incident:assigned'
  | 'investigation:entry_added'
  | 'telemetry:event_ingested';

export interface RealtimeMessage<T = unknown> {
  event: RealtimeEventType;
  timestamp: string;
  data: T;
}

export interface AuthenticatedWebSocket extends WebSocket {
  userId?: number;
  email?: string;
  role?: UserRole;
  isAlive?: boolean;
}

export class RealtimeGateway {
  private static instance: RealtimeGateway | null = null;
  private wss: WebSocketServer;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private clients: Set<AuthenticatedWebSocket> = new Set();

  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
    this.setupWss();
    this.startHeartbeat();
  }

  /**
   * Singleton accessor
   */
  static getInstance(): RealtimeGateway {
    if (!RealtimeGateway.instance) {
      RealtimeGateway.instance = new RealtimeGateway();
    }
    return RealtimeGateway.instance;
  }

  /**
   * Configures WebSocket Server connection handling
   */
  private setupWss() {
    this.wss.on('connection', (ws: AuthenticatedWebSocket, _req: IncomingMessage, payload: TokenPayload) => {
      ws.userId = payload.id;
      ws.email = payload.email;
      ws.role = payload.role;
      ws.isAlive = true;

      this.clients.add(ws);

      // Pong listener for heartbeat
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Cleanup on close
      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', (err) => {
        console.error(`[RealtimeGateway] Socket error (User ${ws.userId}):`, err.message);
        this.clients.delete(ws);
      });

      // Send initial welcome/ready message
      const welcomeMsg = JSON.stringify({
        event: 'gateway:connected',
        timestamp: new Date().toISOString(),
        data: {
          message: 'Connected to NetGuard SOC Realtime Gateway',
          userId: ws.userId,
          role: ws.role,
        },
      });
      ws.send(welcomeMsg);
    });
  }

  /**
   * Attaches HTTP upgrade handler to Express HTTP server
   */
  attach(server: HttpServer) {
    server.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
      try {
        const host = request.headers.host || 'localhost';
        const url = new URL(request.url || '/', `http://${host}`);

        // Only handle /ws path
        if (url.pathname !== '/ws') {
          return;
        }

        const token = url.searchParams.get('token');
        if (!token) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\nMissing token');
          socket.destroy();
          return;
        }

        // Validate JWT token
        let payload: TokenPayload;
        try {
          payload = AuthService.verifyToken(token);
        } catch {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\nInvalid or expired token');
          socket.destroy();
          return;
        }

        // Upgrade connection
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request, payload);
        });
      } catch (err) {
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
      }
    });
  }

  /**
   * Broadcasts a domain event to all connected authenticated clients
   */
  broadcast<T>(event: RealtimeEventType, data: T) {
    const msg: RealtimeMessage<T> = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };
    const payload = JSON.stringify(msg);

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  /**
   * Returns active connection count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * 25-second heartbeat ping to detect dead sockets
   */
  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      for (const ws of this.clients) {
        if (!ws.isAlive) {
          this.clients.delete(ws);
          ws.terminate();
        } else {
          ws.isAlive = false;
          ws.ping();
        }
      }
    }, 25000);
  }

  /**
   * Graceful cleanup
   */
  close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    for (const ws of this.clients) {
      ws.terminate();
    }
    this.clients.clear();
    this.wss.close();
  }
}
