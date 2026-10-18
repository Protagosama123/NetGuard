import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext.tsx';

export type RealtimeConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';

export interface RealtimeMessage<T = any> {
  event: string;
  timestamp: string;
  data: T;
}

export type RealtimeEventHandler = (msg: RealtimeMessage) => void;

interface RealtimeContextValue {
  status: RealtimeConnectionStatus;
  lastMessage: RealtimeMessage | null;
  subscribe: (event: string, handler: RealtimeEventHandler) => () => void;
  reconnect: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | undefined>(undefined);

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, user } = useAuth();
  const [status, setStatus] = useState<RealtimeConnectionStatus>('DISCONNECTED');
  const [lastMessage, setLastMessage] = useState<RealtimeMessage | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const handlersRef = useRef<Map<string, Set<RealtimeEventHandler>>>(new Map());
  const isManuallyClosedRef = useRef(false);

  // Subscribe to specific event types or '*' for all
  const subscribe = useCallback((event: string, handler: RealtimeEventHandler) => {
    if (!handlersRef.current.has(event)) {
      handlersRef.current.set(event, new Set());
    }
    handlersRef.current.get(event)!.add(handler);

    return () => {
      const handlers = handlersRef.current.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          handlersRef.current.delete(event);
        }
      }
    };
  }, []);

  const dispatchMessage = useCallback((msg: RealtimeMessage) => {
    setLastMessage(msg);

    // Call specific listeners
    const specificHandlers = handlersRef.current.get(msg.event);
    if (specificHandlers) {
      for (const handler of specificHandlers) {
        try {
          handler(msg);
        } catch (err) {
          console.error(`[RealtimeContext] Error in handler for ${msg.event}:`, err);
        }
      }
    }

    // Call wildcard listeners
    const wildcardHandlers = handlersRef.current.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          handler(msg);
        } catch (err) {
          console.error(`[RealtimeContext] Error in wildcard handler:`, err);
        }
      }
    }
  }, []);

  const connect = useCallback(() => {
    if (!token) {
      setStatus('DISCONNECTED');
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    // Clear any pending reconnect timer
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    isManuallyClosedRef.current = false;
    setStatus((prev) => (prev === 'CONNECTED' ? 'CONNECTED' : reconnectAttemptRef.current > 0 ? 'RECONNECTING' : 'CONNECTING'));

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;

      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        const wasReconnecting = reconnectAttemptRef.current > 0;
        reconnectAttemptRef.current = 0;
        setStatus('CONNECTED');

        // Mandatory REST resync on reconnect: notify subscribers
        if (wasReconnecting) {
          dispatchMessage({
            event: 'gateway:resync_required',
            timestamp: new Date().toISOString(),
            data: { reason: 'Socket reconnected' },
          });
        }
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed && parsed.event) {
            dispatchMessage(parsed);
          }
        } catch (err) {
          console.warn('[RealtimeContext] Failed to parse message:', event.data);
        }
      };

      socket.onclose = () => {
        if (isManuallyClosedRef.current) {
          setStatus('DISCONNECTED');
          return;
        }

        // Schedule reconnect with exponential backoff
        setStatus('RECONNECTING');
        const delay = Math.min(10000, 1000 * Math.pow(2, reconnectAttemptRef.current));
        reconnectAttemptRef.current++;

        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      };

      socket.onerror = (err) => {
        console.warn('[RealtimeContext] WebSocket connection error');
        // socket.onclose will be called automatically
      };
    } catch (err) {
      console.error('[RealtimeContext] Connection attempt failed:', err);
      setStatus('RECONNECTING');
    }
  }, [token, dispatchMessage]);

  const reconnect = useCallback(() => {
    reconnectAttemptRef.current = 0;
    if (wsRef.current) {
      isManuallyClosedRef.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }
    connect();
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      isManuallyClosedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return (
    <RealtimeContext.Provider value={{ status, lastMessage, subscribe, reconnect }}>
      {children}
    </RealtimeContext.Provider>
  );
};

export const useRealtime = (): RealtimeContextValue => {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
};
