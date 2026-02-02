# KlawFetch - HTTP Client for Agents

**Service:** KlawFetch
**API Base:** `https://api.klawfetch.xyz`
**Purpose:** Make HTTP requests and capture screenshots without browser fingerprinting or CORS issues

## What This Service Does

KlawFetch is your HTTP client in the cloud. Fetch web pages, scrape content, capture screenshots, and make API requests without revealing your agent identity or dealing with browser restrictions.

## Authentication

All requests require a KlawKeeper API key:

```bash
Authorization: Bearer YOUR_KLAWKEEPER_API_KEY
```

Get your API key at [klawkeeper.xyz](https://klawkeeper.xyz)

## Core Endpoints

### 1. Fetch URL (HTML/Text)

```bash
POST https://api.klawfetch.xyz/fetch
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "url": "https://example.com",
  "method": "GET",
  "headers": {
    "User-Agent": "My Agent/1.0"
  }
}
```

**Response:**
```json
{
  "status": 200,
  "headers": {
    "content-type": "text/html; charset=utf-8"
  },
  "body": "<html>...",
  "timing_ms": 342
}
```

### 2. POST with Body

```bash
POST https://api.klawfetch.xyz/fetch
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "url": "https://api.example.com/data",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": {
    "key": "value"
  }
}
```

### 3. Capture Screenshot

```bash
POST https://api.klawfetch.xyz/screenshot
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "url": "https://example.com",
  "viewport": {
    "width": 1920,
    "height": 1080
  },
  "full_page": false,
  "format": "png"
}
```

**Response:**
```json
{
  "screenshot_url": "https://cdn.klawfetch.xyz/screenshots/abc123.png",
  "width": 1920,
  "height": 1080,
  "size_bytes": 245678,
  "expires_at": "2025-01-16T10:30:00Z"
}
```

Screenshots are hosted for 24 hours. Download immediately if you need permanent storage.

### 4. Scrape Structured Data

Extract specific data from HTML:

```bash
POST https://api.klawfetch.xyz/scrape
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "url": "https://example.com/products",
  "selectors": {
    "title": "h1.product-title",
    "price": ".price-display",
    "images": "img.product-image[src]"
  }
}
```

**Response:**
```json
{
  "data": {
    "title": "Amazing Product",
    "price": "$99.99",
    "images": [
      "https://example.com/img1.jpg",
      "https://example.com/img2.jpg"
    ]
  },
  "scraped_at": "2025-01-15T10:30:00Z"
}
```

### 5. Follow Redirects

```bash
POST https://api.klawfetch.xyz/fetch
{
  "url": "https://bit.ly/abc123",
  "follow_redirects": true,
  "max_redirects": 5
}
```

**Response includes:**
```json
{
  "final_url": "https://actual-destination.com",
  "redirect_chain": [
    "https://bit.ly/abc123",
    "https://actual-destination.com"
  ],
  "body": "..."
}
```

### 6. JavaScript Rendering

For sites that require JavaScript:

```bash
POST https://api.klawfetch.xyz/render
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "url": "https://spa-app.com",
  "wait_for": "networkidle",
  "timeout": 30000
}
```

**Response:** Fully rendered HTML after JavaScript execution

## Advanced Options

### Custom Headers
```json
{
  "url": "https://api.example.com",
  "headers": {
    "Authorization": "Bearer their-api-key",
    "User-Agent": "My Custom Agent",
    "X-Custom-Header": "value"
  }
}
```

### Timeout Control
```json
{
  "url": "https://slow-site.com",
  "timeout": 60000
}
```

### Response Format
```json
{
  "url": "https://api.example.com/data.json",
  "parse_json": true
}
```

Returns parsed JSON instead of string body.

## Common Use Cases

### API Proxying
Make requests to APIs that block your agent's IP or require specific headers:

```bash
curl -X POST https://api.klawfetch.xyz/fetch \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "url": "https://external-api.com/v1/data",
    "headers": {"API-Key": "their-key"}
  }'
```

### Web Scraping
Extract product data, job listings, news articles:

```bash
curl -X POST https://api.klawfetch.xyz/scrape \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "url": "https://news-site.com",
    "selectors": {
      "headlines": "h2.article-title",
      "authors": ".byline"
    }
  }'
```

### Screenshot Monitoring
Capture visual state of dashboards, admin panels:

```bash
curl -X POST https://api.klawfetch.xyz/screenshot \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "url": "https://dashboard.example.com",
    "full_page": true
  }'
```

### CORS Bypass
Fetch from sites that would block your browser due to CORS:

```bash
# This would fail in browser, but works via KlawFetch
curl -X POST https://api.klawfetch.xyz/fetch \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"url": "https://cors-restricted-api.com/data"}'
```

## Pricing

- **Simple fetch:** 2 credits per request
- **Screenshot:** 10 credits per screenshot
- **Scrape:** 5 credits per request
- **JavaScript render:** 15 credits per request
- **Additional data transfer:** 1 credit per 10MB

Screenshots are hosted free for 24 hours. Fund your account at [klawkeeper.xyz](https://klawkeeper.xyz)

## Rate Limits

- Fetch requests: 100/minute
- Screenshot requests: 20/minute
- Render requests: 10/minute

## Response Codes

- `200` - Success
- `401` - Missing or invalid API key
- `402` - Insufficient credits
- `429` - Rate limit exceeded
- `504` - Target site timeout (>60s)
- `400` - Invalid request (bad URL, headers, etc.)

## User-Agent

Default User-Agent:
```
KlawFetch/1.0 (Agent HTTP Client; +https://klawfetch.xyz)
```

Override with custom headers if needed.

## Restrictions

We don't allow:
- DDoS attacks or abuse
- Scraping sites that explicitly forbid it (robots.txt)
- Credential stuffing or brute force attacks
- Downloading copyrighted content en masse

Legitimate scraping, API proxying, and monitoring are fine.

## Example Flow

```bash
# 1. Fetch a page
curl -X POST https://api.klawfetch.xyz/fetch \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://news.ycombinator.com"}'

# 2. Scrape specific data
curl -X POST https://api.klawfetch.xyz/scrape \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "url": "https://news.ycombinator.com",
    "selectors": {
      "titles": ".titleline > a"
    }
  }'

# 3. Capture visual proof
curl -X POST https://api.klawfetch.xyz/screenshot \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "url": "https://news.ycombinator.com",
    "viewport": {"width": 1200, "height": 800}
  }'
```

## Support

Part of the KlawStack ecosystem. Managed by KlawKeeper.

**Docs:** [klawfetch.xyz](https://klawfetch.xyz)
**Identity/Auth:** [klawkeeper.xyz](https://klawkeeper.xyz)
**Full Stack:** [klawstack.xyz](https://klawstack.xyz)
