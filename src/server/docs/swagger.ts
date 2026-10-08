import swaggerUi from 'swagger-ui-express';
import { Router } from 'express';

export const docsRouter = Router();

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'NetGuard V0 API',
    version: '0.1.0',
    description: 'NetGuard Network Security Platform & Snort Telemetry Management API',
  },
  servers: [
    {
      url: '/',
      description: 'Current Environment',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Provide your NetGuard JWT token in the format: Bearer <token>',
      },
      IngestApiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Ingest-Key',
        description: 'Snort forwarder API key for background telemetry ingestion',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          email: { type: 'string', example: 'analyst@netguard.local' },
          role: { type: 'string', enum: ['ADMIN', 'ANALYST', 'VIEWER'], example: 'ANALYST' },
          isActive: { type: 'boolean', example: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      SecurityEvent: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 101 },
          timestamp: { type: 'string', format: 'date-time' },
          generatorId: { type: 'integer', example: 1 },
          signatureId: { type: 'integer', example: 2001219 },
          signatureRevision: { type: 'integer', example: 4 },
          signatureMessage: { type: 'string', example: 'ET SCAN Potential SSH Scan OUTBOUND' },
          classification: { type: 'string', example: 'Attempted Information Leak' },
          priority: { type: 'integer', example: 2, description: '1=High, 2=Medium, 3=Low, 4=Info' },
          protocol: { type: 'string', example: 'TCP' },
          sourceIp: { type: 'string', example: '192.168.1.105' },
          sourcePort: { type: 'integer', nullable: true, example: 54320 },
          destinationIp: { type: 'string', example: '10.0.0.1' },
          destinationPort: { type: 'integer', nullable: true, example: 22 },
          rawPayload: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/api/health': {
      get: {
        summary: 'Health check',
        responses: { '200': { description: 'Service operational status' } },
      },
    },
    '/api/auth/register': {
      post: {
        summary: 'Register a new user account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'User registered' } },
      },
    },
    '/api/auth/login': {
      post: {
        summary: 'Authenticate and receive JWT token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Login successful' } },
      },
    },
    '/api/auth/me': {
      get: {
        summary: 'Get current user profile',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Current profile' } },
      },
    },
    '/api/users': {
      get: {
        summary: 'List all users (ADMIN only)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'List of users' } },
      },
    },
    '/api/users/{id}/role': {
      patch: {
        summary: 'Update user role (ADMIN only)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['role'],
                properties: { role: { type: 'string', enum: ['ADMIN', 'ANALYST', 'VIEWER'] } },
              },
            },
          },
        },
        responses: { '200': { description: 'Role updated' } },
      },
    },
    '/api/users/{id}/status': {
      patch: {
        summary: 'Toggle active status (ADMIN only)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['isActive'],
                properties: { isActive: { type: 'boolean' } },
              },
            },
          },
        },
        responses: { '200': { description: 'Status updated' } },
      },
    },
    '/api/events/ingest': {
      post: {
        summary: 'Ingest Snort alert telemetry (ADMIN, ANALYST, or X-Ingest-Key)',
        security: [{ BearerAuth: [] }, { IngestApiKey: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  { $ref: '#/components/schemas/SecurityEvent' },
                  { type: 'array', items: { $ref: '#/components/schemas/SecurityEvent' } },
                ],
              },
            },
          },
        },
        responses: { '201': { description: 'Events ingested' } },
      },
    },
    '/api/events': {
      get: {
        summary: 'Query security events with filters & pagination',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'priority', in: 'query', schema: { type: 'integer' } },
          { name: 'protocol', in: 'query', schema: { type: 'string' } },
          { name: 'sourceIp', in: 'query', schema: { type: 'string' } },
          { name: 'destinationIp', in: 'query', schema: { type: 'string' } },
          { name: 'signatureId', in: 'query', schema: { type: 'integer' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Paginated event results' } },
      },
    },
    '/api/events/stats': {
      get: {
        summary: 'Telemetry aggregation statistics',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Metrics summary' } },
      },
    },
    '/api/events/{id}': {
      get: {
        summary: 'Get single security event by ID',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Event detail' } },
      },
    },
  },
};

// Raw JSON endpoint
docsRouter.get('/openapi.json', (_req, res) => {
  res.json(openApiSpec);
});

// Swagger UI Interactive Docs
docsRouter.use('/', swaggerUi.serve, swaggerUi.setup(openApiSpec));
