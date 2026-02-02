// Cloudflare Pages Function - Proxy /v1/* requests to regional backends
// Regional backend servers for KlawFetch
const BACKENDS = {
  'eu-frankfurt': 'http://fra.klawfetch.xyz:3000',
  'ap-sydney': 'http://syd.klawfetch.xyz:3000',
  'us-west': 'http://sfo.klawfetch.xyz:3000',
  'us-east': 'http://nyc.klawfetch.xyz:3000',
};

const DEFAULT_REGION = 'us-east';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  try {
    // For POST requests, parse body to get region
    let region = DEFAULT_REGION;
    let bodyText = null;

    if (request.method === 'POST') {
      bodyText = await request.text();
      try {
        const body = JSON.parse(bodyText);
        if (body.region && BACKENDS[body.region]) {
          region = body.region;
        }
      } catch (e) {
        // Not JSON or no region, use default
      }
    }

    // Build backend URL
    const backendBase = BACKENDS[region];
    const backendPath = url.pathname + url.search;
    const backendUrl = backendBase + backendPath;

    // Forward request to regional backend
    const backendRequest = new Request(backendUrl, {
      method: request.method,
      headers: request.headers,
      body: bodyText,
      redirect: 'follow',
    });

    const response = await fetch(backendRequest);

    // Clone response and add CORS headers
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Backend unavailable',
      details: error.message
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
