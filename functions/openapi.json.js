// Cloudflare Pages Function - Serve OpenAPI spec
export async function onRequest(context) {
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'KlawFetch API',
      description: 'HTTP proxy for AI agents. Make outbound HTTP requests from multiple global regions. Bypass geo-restrictions and rate limits.',
      version: '1.0.0',
      contact: { name: 'KlawFetch Support', url: 'https://klawfetch.xyz', email: 'support@klawfetch.xyz' },
      'x-logo': { url: 'https://klawfetch.xyz/logo.png' }
    },
    servers: [{ url: 'https://klawfetch.xyz', description: 'Production' }],
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
          description: 'Make an HTTP request through KlawFetch proxy. Request originates from the specified region.',
          operationId: 'proxyRequest',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FetchRequest' },
                example: { url: 'https://api.example.com/data', method: 'GET', headers: { 'Accept': 'application/json' }, region: 'us-east' }
              }
            }
          },
          responses: {
            '200': { description: 'Proxied response', content: { 'application/json': { schema: { $ref: '#/components/schemas/FetchResponse' } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '402': { description: 'Insufficient credits' }
          }
        }
      },
      '/v1/regions': {
        get: {
          tags: ['Regions'],
          summary: 'List available regions',
          description: 'Get list of available proxy regions (Frankfurt, Sydney, San Francisco, New York).',
          operationId: 'listRegions',
          responses: {
            '200': { description: 'List of regions', content: { 'application/json': { schema: { $ref: '#/components/schemas/RegionsResponse' } } } }
          }
        }
      },
      '/v1/usage': {
        get: {
          tags: ['Usage'],
          summary: 'Get usage stats',
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
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'KlawKeeper API token from klawkeeper.xyz' }
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
            timeout: { type: 'integer', default: 30000, maximum: 30000 },
            region: { type: 'string', enum: ['eu-frankfurt', 'ap-sydney', 'us-west', 'us-east'], description: 'Proxy region' }
          }
        },
        FetchResponse: {
          type: 'object',
          properties: {
            status: { type: 'integer' },
            headers: { type: 'object', additionalProperties: { type: 'string' } },
            body: { type: 'string' },
            region: { type: 'string' },
            latency_ms: { type: 'integer' }
          }
        },
        RegionsResponse: {
          type: 'object',
          properties: {
            regions: { type: 'array', items: { $ref: '#/components/schemas/Region' } },
            current: { type: 'string' }
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
            balance: { type: 'number' },
            region: { type: 'string' },
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

  return new Response(JSON.stringify(spec, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
