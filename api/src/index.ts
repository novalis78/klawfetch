import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';

// Region identifier - set via environment variable
const REGION = process.env.KEYFETCH_REGION || 'unknown';
const PORT = parseInt(process.env.PORT || '3000', 10);
const KEYKEEPER_API = process.env.KEYKEEPER_API || 'https://keykeeper.world/api';
const SERVICE_SECRET = process.env.SERVICE_SECRET || 'dev-service-secret';
const USAGE_REPORT_INTERVAL = parseInt(process.env.USAGE_REPORT_INTERVAL || '30000', 10); // 30 seconds

interface FetchRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

interface FetchResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  region: string;
  latency_ms: number;
}

interface UsageRecord {
  agent_id: string;
  operation: string;
  quantity: number;
  timestamp: string;
  metadata: {
    region: string;
    target_domain: string;
    latency_ms: number;
    status: number;
    bytes: number;
  };
}

interface VerifyResponse {
  valid: boolean;
  agent_id?: string;
  email?: string;
  balance?: number;
  cost_per_unit?: number;
  can_afford?: boolean;
  error?: string;
}

// Pending usage records to be reported to KeyKeeper
const pendingUsage: UsageRecord[] = [];

// Cache for token verification (TTL 60 seconds)
const tokenCache = new Map<string, { result: VerifyResponse; expires: number }>();
const TOKEN_CACHE_TTL = 60000; // 1 minute

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type'],
}));

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    region: REGION,
    timestamp: new Date().toISOString(),
    pending_usage_records: pendingUsage.length
  });
});

// Region info
app.get('/v1/regions', (c) => {
  return c.json({
    regions: [
      { id: 'eu-frankfurt', name: 'Frankfurt', country: 'DE', status: 'online' },
      { id: 'ap-sydney', name: 'Sydney', country: 'AU', status: 'online' },
      { id: 'us-west', name: 'San Francisco', country: 'US', status: 'online' },
      { id: 'us-east', name: 'New York', country: 'US', status: 'online' },
    ],
    current: REGION,
  });
});

// Verify token against KeyKeeper API
async function verifyToken(token: string): Promise<VerifyResponse> {
  if (!token) {
    return { valid: false, error: 'No token provided' };
  }

  // Check cache first
  const cached = tokenCache.get(token);
  if (cached && cached.expires > Date.now()) {
    return cached.result;
  }

  try {
    const response = await fetch(`${KEYKEEPER_API}/v1/services/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Secret': SERVICE_SECRET,
      },
      body: JSON.stringify({
        token,
        service: 'keyfetch',
        operation: 'proxy_request',
        quantity: 1,
      }),
    });

    const data = await response.json() as VerifyResponse;

    // Cache successful verifications
    if (data.valid) {
      tokenCache.set(token, {
        result: data,
        expires: Date.now() + TOKEN_CACHE_TTL,
      });
    }

    return data;
  } catch (error) {
    console.error('KeyKeeper verification error:', error);
    // On KeyKeeper connection failure, deny access for security
    return { valid: false, error: 'Authentication service unavailable' };
  }
}

// Report usage to KeyKeeper
async function reportUsage(): Promise<void> {
  if (pendingUsage.length === 0) {
    return;
  }

  // Take all pending records
  const records = pendingUsage.splice(0, pendingUsage.length);

  try {
    const response = await fetch(`${KEYKEEPER_API}/v1/services/usage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Secret': SERVICE_SECRET,
      },
      body: JSON.stringify({
        service: 'keyfetch',
        region: REGION,
        records: records,
      }),
    });

    if (!response.ok) {
      console.error('Usage report failed:', await response.text());
      // Put records back for retry
      pendingUsage.push(...records);
    } else {
      const result = await response.json();
      console.log(`Usage reported: ${result.processed} records, ${result.total_credits_deducted} credits deducted`);
    }
  } catch (error) {
    console.error('Failed to report usage to KeyKeeper:', error);
    // Put records back for retry
    pendingUsage.push(...records);
  }
}

// Start periodic usage reporting
setInterval(reportUsage, USAGE_REPORT_INTERVAL);

// Main fetch endpoint
app.post('/v1/fetch', async (c) => {
  const startTime = Date.now();

  // Extract and verify token
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  const auth = await verifyToken(token);

  if (!auth.valid) {
    return c.json({ error: auth.error }, 401);
  }

  // Check if agent can afford the request
  if (auth.can_afford === false) {
    return c.json({
      error: 'Insufficient credits',
      balance: auth.balance,
      cost_per_request: auth.cost_per_unit,
    }, 402);
  }

  // Parse request body
  let body: FetchRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  // Validate required fields
  if (!body.url) {
    return c.json({ error: 'Missing required field: url' }, 400);
  }

  // Validate URL
  let targetUrl: URL;
  try {
    targetUrl = new URL(body.url);
  } catch {
    return c.json({ error: 'Invalid URL' }, 400);
  }

  // Block internal IPs (basic security)
  const hostname = targetUrl.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
    return c.json({ error: 'Internal URLs not allowed' }, 403);
  }

  // Prepare fetch options
  const method = (body.method || 'GET').toUpperCase();
  const timeout = Math.min(body.timeout || 30000, 30000); // Max 30 seconds

  const fetchOptions: RequestInit = {
    method,
    headers: {
      'User-Agent': 'KeyFetch/1.0',
      ...body.headers,
    },
    signal: AbortSignal.timeout(timeout),
  };

  // Add body for non-GET requests
  if (method !== 'GET' && method !== 'HEAD' && body.body) {
    fetchOptions.body = typeof body.body === 'string' ? body.body : JSON.stringify(body.body);
  }

  // Make the request
  try {
    const response = await fetch(body.url, fetchOptions);
    const responseBody = await response.text();
    const latency = Date.now() - startTime;

    // Convert headers to plain object
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    // Queue usage record for reporting to KeyKeeper
    pendingUsage.push({
      agent_id: auth.agent_id!,
      operation: 'proxy_request',
      quantity: 1,
      timestamp: new Date().toISOString(),
      metadata: {
        region: REGION,
        target_domain: targetUrl.hostname,
        latency_ms: latency,
        status: response.status,
        bytes: responseBody.length,
      },
    });

    // Trim pending usage if too large (prevent memory issues)
    if (pendingUsage.length > 10000) {
      console.warn('Pending usage queue too large, forcing report');
      reportUsage();
    }

    const result: FetchResponse = {
      status: response.status,
      headers: responseHeaders,
      body: responseBody,
      region: REGION,
      latency_ms: latency,
    };

    return c.json(result);
  } catch (error) {
    const latency = Date.now() - startTime;

    if (error instanceof Error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        return c.json({ error: 'Request timeout', region: REGION, latency_ms: latency }, 504);
      }
      return c.json({ error: error.message, region: REGION, latency_ms: latency }, 502);
    }

    return c.json({ error: 'Unknown error', region: REGION, latency_ms: latency }, 500);
  }
});

// Usage stats (for agents to check their own usage)
app.get('/v1/usage', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  const auth = await verifyToken(token);

  if (!auth.valid) {
    return c.json({ error: auth.error }, 401);
  }

  // Filter pending usage for this agent
  const agentUsage = pendingUsage.filter(r => r.agent_id === auth.agent_id);

  return c.json({
    agent_id: auth.agent_id,
    email: auth.email,
    balance: auth.balance,
    region: REGION,
    pending_records: agentUsage.length,
    cost_per_request: auth.cost_per_unit,
  });
});

// OpenAPI spec for APIs.guru
const openapiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'KeyFetch API',
    description: 'HTTP proxy for AI agents. Make outbound HTTP requests from multiple global regions. Bypass geo-restrictions and rate limits.',
    version: '1.0.0',
    contact: { name: 'KeyFetch Support', url: 'https://keyfetch.world', email: 'support@keyfetch.world' },
    'x-logo': { url: 'https://keyfetch.world/logo.png' }
  },
  servers: [{ url: 'https://api.keyfetch.world', description: 'Production' }],
  tags: [
    { name: 'Proxy', description: 'HTTP proxy requests' },
    { name: 'Regions', description: 'Available proxy regions' },
    { name: 'Usage', description: 'Usage tracking' }
  ],
  paths: {
    '/v1/fetch': {
      post: {
        tags: ['Proxy'],
        summary: 'Proxy an HTTP request',
        description: 'Make an HTTP request through KeyFetch proxy. Request originates from the specified region.',
        operationId: 'proxyRequest',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/FetchRequest' },
              example: { url: 'https://api.example.com/data', method: 'GET', headers: { 'Accept': 'application/json' } }
            }
          }
        },
        responses: {
          '200': { description: 'Proxied response', content: { 'application/json': { schema: { $ref: '#/components/schemas/FetchResponse' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '402': { description: 'Insufficient credits', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },
    '/v1/regions': {
      get: {
        tags: ['Regions'],
        summary: 'List available regions',
        description: 'Get list of available proxy regions and their status.',
        operationId: 'listRegions',
        responses: {
          '200': {
            description: 'List of regions',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RegionsResponse' } } }
          }
        }
      }
    },
    '/v1/usage': {
      get: {
        tags: ['Usage'],
        summary: 'Get usage stats',
        description: 'Get your current usage statistics and balance.',
        operationId: 'getUsage',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Usage statistics', content: { 'application/json': { schema: { $ref: '#/components/schemas/UsageResponse' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', description: 'KeyKeeper API token from keykeeper.world' }
    },
    schemas: {
      FetchRequest: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', format: 'uri', description: 'Target URL to fetch' },
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'], default: 'GET' },
          headers: { type: 'object', additionalProperties: { type: 'string' } },
          body: { description: 'Request body (for POST/PUT/PATCH)' },
          timeout: { type: 'integer', default: 30000, maximum: 30000, description: 'Timeout in milliseconds' }
        }
      },
      FetchResponse: {
        type: 'object',
        properties: {
          status: { type: 'integer', description: 'HTTP status code' },
          headers: { type: 'object', additionalProperties: { type: 'string' } },
          body: { type: 'string', description: 'Response body' },
          region: { type: 'string', description: 'Region that served the request' },
          latency_ms: { type: 'integer', description: 'Request latency in milliseconds' }
        }
      },
      RegionsResponse: {
        type: 'object',
        properties: {
          regions: { type: 'array', items: { $ref: '#/components/schemas/Region' } },
          current: { type: 'string', description: 'Current server region' }
        }
      },
      Region: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          country: { type: 'string' },
          status: { type: 'string', enum: ['online', 'offline'] }
        }
      },
      UsageResponse: {
        type: 'object',
        properties: {
          agent_id: { type: 'string' },
          email: { type: 'string' },
          balance: { type: 'number' },
          region: { type: 'string' },
          pending_records: { type: 'integer' },
          cost_per_request: { type: 'number' }
        }
      },
      Error: { type: 'object', properties: { error: { type: 'string' } } }
    },
    responses: {
      Unauthorized: { description: 'Missing or invalid authentication', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
    }
  }
};

app.get('/openapi.json', (c) => c.json(openapiSpec));

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

// Graceful shutdown - report remaining usage
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, reporting remaining usage...');
  await reportUsage();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, reporting remaining usage...');
  await reportUsage();
  process.exit(0);
});

// Start server
console.log(`KeyFetch API starting on port ${PORT}`);
console.log(`Region: ${REGION}`);
console.log(`KeyKeeper API: ${KEYKEEPER_API}`);
console.log(`Usage report interval: ${USAGE_REPORT_INTERVAL}ms`);

serve({
  fetch: app.fetch,
  port: PORT,
}, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
