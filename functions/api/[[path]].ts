// Cloudflare Pages Function to proxy /api/* to regional VPS servers
// Routes to closest server based on user location

interface Env {
  // No env vars needed - uses public VPS IPs
}

// Regional server mapping (using DNS subdomains)
const REGION_SERVERS = {
  'eu-frankfurt': 'http://fra.klawfetch.xyz:3000',
  'ap-sydney': 'http://syd.klawfetch.xyz:3000',
  'us-west': 'http://sfo.klawfetch.xyz:3000',
  'us-east': 'http://nyc.klawfetch.xyz:3000',
};

// Map Cloudflare regions to our servers
function getServerForRegion(colo: string | undefined): string {
  if (!colo) return REGION_SERVERS['us-east']; // Default

  const upper = colo.toUpperCase();

  // Europe
  if (['FRA', 'AMS', 'LHR', 'CDG', 'WAW', 'VIE', 'PRG', 'ZRH', 'MIL', 'MAD', 'BCN'].includes(upper)) {
    return REGION_SERVERS['eu-frankfurt'];
  }

  // Asia Pacific
  if (['SYD', 'MEL', 'SIN', 'HKG', 'NRT', 'ICN', 'BOM', 'DEL', 'BKK'].includes(upper)) {
    return REGION_SERVERS['ap-sydney'];
  }

  // US West
  if (['SFO', 'LAX', 'SEA', 'SJC', 'PDX', 'DEN', 'PHX'].includes(upper)) {
    return REGION_SERVERS['us-west'];
  }

  // US East (default for Americas)
  return REGION_SERVERS['us-east'];
}

export async function onRequest(context: { request: Request; env: Env }) {
  const { request } = context;
  const url = new URL(request.url);

  // Determine which regional server to use
  const cf = (request as any).cf;
  const colo = cf?.colo; // Cloudflare colo code (e.g., 'SFO', 'FRA')
  const serverUrl = getServerForRegion(colo);

  // Build target URL (preserve path after /api/)
  const path = url.pathname.replace(/^\/api/, '');
  const targetUrl = `${serverUrl}${path}${url.search}`;

  // Forward the request
  try {
    const headers = new Headers(request.headers);

    // Add X-Forwarded headers
    headers.set('X-Forwarded-For', cf?.ip || 'unknown');
    headers.set('X-Forwarded-Proto', 'https');
    headers.set('X-Forwarded-Host', url.hostname);

    // Remove host header to avoid conflicts
    headers.delete('host');

    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.arrayBuffer() : undefined,
    });

    // Create response with CORS headers
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('X-Served-By', serverUrl);
    responseHeaders.set('X-Region', colo || 'unknown');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(JSON.stringify({
      error: 'Proxy error',
      message: error instanceof Error ? error.message : 'Unknown error',
      target: serverUrl,
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
