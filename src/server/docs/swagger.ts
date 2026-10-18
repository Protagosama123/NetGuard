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
      Alert: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          securityEventId: { type: 'integer', nullable: true, example: 101 },
          title: { type: 'string', example: 'ET SCAN Potential SSH Scan OUTBOUND' },
          description: { type: 'string', nullable: true, example: 'Snort Telemetry Detection [SID:2001219]' },
          severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'], example: 'HIGH' },
          status: { type: 'string', enum: ['NEW', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'], example: 'NEW' },
          sourceIp: { type: 'string', example: '192.168.1.105' },
          destinationIp: { type: 'string', example: '10.0.0.1' },
          signatureId: { type: 'integer', example: 2001219 },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Incident: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          title: { type: 'string', example: 'INC-101: Lateral Privilege Escalation' },
          description: { type: 'string', example: 'Coordinated root-level response tokens observed' },
          severity: { type: 'string', enum: ['SEV1', 'SEV2', 'SEV3', 'SEV4'], example: 'SEV1' },
          status: { type: 'string', enum: ['OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED', 'CLOSED'], example: 'INVESTIGATING' },
          assignedTo: { type: 'integer', nullable: true },
          createdBy: { type: 'integer', nullable: true },
          resolvedAt: { type: 'string', format: 'date-time', nullable: true },
          resolutionSummary: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      InvestigationEntry: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          incidentId: { type: 'integer', example: 101 },
          authorId: { type: 'integer', nullable: true, example: 1 },
          entryType: { type: 'string', enum: ['NOTE', 'ACTION_TAKEN', 'CONTAINMENT', 'EVIDENCE'], example: 'NOTE' },
          content: { type: 'string', example: 'Verified perimeter firewall rules successfully dropped subsequent scan packets.' },
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
    '/api/users/audit': {
      get: {
        summary: 'Retrieve administrative audit log trail (ADMIN only) (V2.2)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 50 } },
          { name: 'offset', in: 'query', required: false, schema: { type: 'integer', default: 0 } },
        ],
        responses: { '200': { description: 'List of audit log records' } },
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
    '/api/alerts': {
      get: {
        summary: 'Query operational alerts with filters & pagination',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['NEW', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'] } },
          { name: 'severity', in: 'query', schema: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] } },
          { name: 'sourceIp', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Paginated alerts results' } },
      },
      post: {
        summary: 'Manually create or promote an alert (ADMIN or ANALYST)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  securityEventId: { type: 'integer' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
                  sourceIp: { type: 'string' },
                  destinationIp: { type: 'string' },
                  signatureId: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Alert created' } },
      },
    },
    '/api/alerts/stats': {
      get: {
        summary: 'Alert counts aggregated by status and severity',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Alert metrics summary' } },
      },
    },
    '/api/alerts/{id}': {
      get: {
        summary: 'Get single alert detail and linked source event',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Alert detail' } },
      },
    },
    '/api/alerts/{id}/status': {
      patch: {
        summary: 'Update alert triage status (ADMIN or ANALYST)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['NEW', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'] },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Status updated' } },
      },
    },
    '/api/incidents': {
      get: {
        summary: 'Query incidents with filters & pagination',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED', 'CLOSED'] } },
          { name: 'severity', in: 'query', schema: { type: 'string', enum: ['SEV1', 'SEV2', 'SEV3', 'SEV4'] } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Paginated incidents list' } },
      },
      post: {
        summary: 'Declare a new incident (ADMIN or ANALYST)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'description', 'severity'],
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  severity: { type: 'string', enum: ['SEV1', 'SEV2', 'SEV3', 'SEV4'] },
                  assignedTo: { type: 'integer', nullable: true },
                  alertIds: { type: 'array', items: { type: 'integer' } },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Incident created' } },
      },
    },
    '/api/incidents/stats': {
      get: {
        summary: 'Incident counts aggregated by status and severity',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Incident metrics summary' } },
      },
    },
    '/api/incidents/{id}': {
      get: {
        summary: 'Get incident details with linked alerts',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Incident detail' } },
      },
    },
    '/api/incidents/{id}/status': {
      patch: {
        summary: 'Update incident lifecycle status (ADMIN or ANALYST)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED', 'CLOSED'] },
                  resolutionSummary: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Status updated' } },
      },
    },
    '/api/incidents/{id}/assign': {
      patch: {
        summary: 'Assign or unassign incident to operator (ADMIN or ANALYST)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  assignedTo: { type: 'integer', nullable: true, example: 1 },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Assignment updated' } },
      },
    },
    '/api/incidents/{id}/resolve': {
      patch: {
        summary: 'Resolve or close incident with resolution summary (ADMIN or ANALYST)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['resolutionSummary'],
                properties: {
                  resolutionSummary: { type: 'string', example: 'Malicious IP null-routed and target system patched.' },
                  status: { type: 'string', enum: ['RESOLVED', 'CLOSED'], default: 'RESOLVED' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Incident resolved' } },
      },
    },
    '/api/incidents/{id}/alerts': {
      post: {
        summary: 'Link alerts to incident (ADMIN or ANALYST)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['alertIds'],
                properties: {
                  alertIds: { type: 'array', items: { type: 'integer' } },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Alerts linked' } },
      },
    },
    '/api/incidents/{id}/investigations': {
      get: {
        summary: 'Get chronological investigation timeline entries',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' } },
        ],
        responses: { '200': { description: 'List of investigation entries' } },
      },
      post: {
        summary: 'Append an investigation note/finding (ADMIN or ANALYST)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['content'],
                properties: {
                  entryType: { type: 'string', enum: ['NOTE', 'ACTION_TAKEN', 'CONTAINMENT', 'EVIDENCE'], default: 'NOTE' },
                  content: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Investigation entry recorded' } },
      },
    },
    '/api/analytics/summary': {
      get: {
        summary: 'Get consolidated SOC metrics and MTTD summary (V2.1)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'timeRange',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['24h', '7d', '30d'], default: '24h' },
            description: 'Analytics time window',
          },
        ],
        responses: {
          '200': {
            description: 'Consolidated analytics summary',
          },
          '400': { description: 'Invalid query parameters' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/analytics/trends': {
      get: {
        summary: 'Get continuous time-series trend buckets for alerts and incidents (V2.1)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'timeRange',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['24h', '7d', '30d'], default: '24h' },
            description: 'Analytics time window',
          },
          {
            name: 'entity',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['alerts', 'incidents', 'all'], default: 'all' },
            description: 'Filter entity type',
          },
        ],
        responses: {
          '200': { description: 'Continuous time-series trend buckets with interval zero-filling' },
          '400': { description: 'Invalid query parameters' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/analytics/mttd': {
      get: {
        summary: 'Get detailed Mean Time to Detect (MTTD) statistics and distribution (V2.1)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'timeRange',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['24h', '7d', '30d'], default: '24h' },
            description: 'Analytics time window',
          },
        ],
        responses: {
          '200': { description: 'MTTD latency statistics (average, median, min, max, sample count, buckets)' },
          '400': { description: 'Invalid query parameters' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/analytics/health': {
      get: {
        summary: 'Get operational subsystem health, database status, and queue pressure (V2.1)',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'System health status and telemetry queue metrics' },
          '401': { description: 'Unauthorized' },
        },
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
