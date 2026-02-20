/**
 * WebMCP Analyzer Proxy Server
 *
 * A lightweight HTTP proxy that allows the WebMCP Analyzer tool to fetch
 * external resources (HTML, JSON, XML, JS) from arbitrary URLs.
 *
 * This server solves the CORS restriction that prevents client-side JavaScript
 * from reading responses from external origins. It validates requests, enforces
 * security constraints, and returns the remote response body along with headers.
 *
 * Security measures:
 * - Only GET and HEAD methods allowed
 * - Only http/https schemes accepted
 * - Private/internal IP ranges blocked (SSRF prevention)
 * - Configurable host whitelist bypasses SSRF for own domain
 * - Response size limited (2 MB max)
 * - Request timeout (15 seconds)
 * - Rate limiting (30 requests per minute per IP)
 * - Only accepts requests from the same origin (Referer check)
 *
 * Setup:
 *   NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt node scripts/webmcp-proxy.mjs
 *   # Listens on port 58292 by default (WEBMCP_PROXY_PORT env to override)
 *   # WEBMCP_PROXY_ALLOWED_HOSTS env to override default host whitelist
 *
 * Nginx integration:
 *   location /api/proxy/fetch {
 *     proxy_pass http://127.0.0.1:58292/;
 *     proxy_set_header Host $host;
 *     proxy_set_header X-Real-IP $remote_addr;
 *     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
 *   }
 */

import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import dns from "node:dns";
import net from "node:net";

/* ── Configuration ─────────────────────────────────────────────── */

const DEFAULT_PORT = 58_292;
const PORT = (() => {
  const envPort = process.env.WEBMCP_PROXY_PORT;
  if (!envPort) return DEFAULT_PORT;
  const parsed = Number.parseInt(envPort, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? DEFAULT_PORT : parsed;
})();

const MAX_RESPONSE_SIZE = 2 * 1024 * 1024; // 2 MB
const REQUEST_TIMEOUT = 15_000; // 15 seconds
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // requests per window per IP

/** Allowed site origins that may use this proxy. */
const ALLOWED_ORIGINS = new Set([
  "https://jmrp.io",
  "https://www.jmrp.io",
  "http://localhost:4321", // dev server
  "http://localhost:4322", // preview server
]);

/**
 * Hostnames exempt from SSRF private-IP checks.
 * The site's own domain resolves to loopback (::1) on this server,
 * but it is safe to proxy since it only serves static files.
 * Override with WEBMCP_PROXY_ALLOWED_HOSTS (comma-separated).
 */
const ALLOWED_HOSTS = new Set(
  process.env.WEBMCP_PROXY_ALLOWED_HOSTS
    ? process.env.WEBMCP_PROXY_ALLOWED_HOSTS.split(",").map((h) => h.trim())
    : ["jmrp.io", "www.jmrp.io"],
);

/* ── SSRF Prevention ───────────────────────────────────────────── */

/**
 * Private/reserved IPv4 and IPv6 ranges (RFC 1918, RFC 6890, etc.)
 * These must never be proxied to prevent SSRF attacks.
 */
const PRIVATE_RANGES_V4 = [
  { start: "0.0.0.0", end: "0.255.255.255" }, // "This" network
  { start: "10.0.0.0", end: "10.255.255.255" }, // Private (RFC 1918)
  { start: "100.64.0.0", end: "100.127.255.255" }, // Shared address space
  { start: "127.0.0.0", end: "127.255.255.255" }, // Loopback
  { start: "169.254.0.0", end: "169.254.255.255" }, // Link-local
  { start: "172.16.0.0", end: "172.31.255.255" }, // Private (RFC 1918)
  { start: "192.0.0.0", end: "192.0.0.255" }, // IETF Protocol
  { start: "192.168.0.0", end: "192.168.255.255" }, // Private (RFC 1918)
  { start: "198.18.0.0", end: "198.19.255.255" }, // Benchmark testing
  { start: "224.0.0.0", end: "255.255.255.255" }, // Multicast + Reserved
];

/**
 * Convert an IPv4 address string to a 32-bit integer for range comparison.
 * @param {string} ip - The IPv4 address.
 * @returns {number} The 32-bit integer representation.
 */
function ipv4ToInt(ip) {
  const parts = ip.split(".").map(Number);
  return (
    ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
  );
}

/**
 * Check if an IPv4 address falls within any private/reserved range.
 * @param {string} ip - The IPv4 address to check.
 * @returns {boolean} True if the address is private/reserved.
 */
function isPrivateIPv4(ip) {
  const num = ipv4ToInt(ip);
  return PRIVATE_RANGES_V4.some(
    (range) => num >= ipv4ToInt(range.start) && num <= ipv4ToInt(range.end),
  );
}

/**
 * Check if an IPv6 address is private/reserved.
 * @param {string} ip - The IPv6 address to check.
 * @returns {boolean} True if the address is private/reserved.
 */
function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  return (
    lower === "::1" || // Loopback
    lower.startsWith("fe80:") || // Link-local
    lower.startsWith("fc") || // Unique local (fc00::/7)
    lower.startsWith("fd") || // Unique local (fc00::/7)
    lower === "::" || // Unspecified
    lower.startsWith("::ffff:") // IPv4-mapped (check the v4 part)
  );
}

/**
 * Resolve a hostname and verify it doesn't point to a private/internal IP.
 * Hostnames in ALLOWED_HOSTS bypass the private-IP check.
 * @param {string} hostname - The hostname to resolve.
 * @returns {Promise<string>} The resolved IP address.
 * @throws {Error} If the hostname resolves to a private IP.
 */
function resolveAndValidate(hostname) {
  const hostWhitelisted = ALLOWED_HOSTS.has(hostname.toLowerCase());

  return new Promise((resolve, reject) => {
    // If it's already an IP address, validate directly
    if (net.isIPv4(hostname)) {
      if (!hostWhitelisted && isPrivateIPv4(hostname)) {
        reject(new Error(`Private IP address not allowed: ${hostname}`));
      } else {
        resolve(hostname);
      }
      return;
    }
    if (net.isIPv6(hostname)) {
      if (!hostWhitelisted && isPrivateIPv6(hostname)) {
        reject(new Error(`Private IPv6 address not allowed: ${hostname}`));
      } else {
        resolve(hostname);
      }
      return;
    }

    dns.lookup(hostname, { all: true }, (err, addresses) => {
      if (err) {
        reject(
          new Error(`DNS resolution failed for ${hostname}: ${err.message}`),
        );
        return;
      }

      // Whitelisted hosts skip private-IP validation
      if (hostWhitelisted) {
        resolve(addresses[0]?.address ?? hostname);
        return;
      }

      for (const addr of addresses) {
        if (addr.family === 4 && isPrivateIPv4(addr.address)) {
          reject(
            new Error(
              `Hostname ${hostname} resolves to private IP ${addr.address}`,
            ),
          );
          return;
        }
        if (addr.family === 6 && isPrivateIPv6(addr.address)) {
          reject(
            new Error(
              `Hostname ${hostname} resolves to private IPv6 ${addr.address}`,
            ),
          );
          return;
        }
      }
      resolve(addresses[0]?.address || hostname);
    });
  });
}

/* ── Rate Limiting ─────────────────────────────────────────────── */

/** @type {Map<string, { count: number, resetAt: number }>} */
const rateLimitStore = new Map();

/**
 * Check and update rate limit for a given IP.
 * @param {string} ip - The client IP address.
 * @returns {boolean} True if the request is allowed.
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

// Periodically clean up expired rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW);

/* ── JSON Response Helpers ─────────────────────────────────────── */

/**
 * Send a JSON error response.
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {string} message
 */
function sendError(res, status, message) {
  const body = JSON.stringify({ error: message });
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

/**
 * Send a JSON success response with the proxied content.
 * @param {http.ServerResponse} res
 * @param {object} data
 */
function sendSuccess(res, data) {
  const body = JSON.stringify(data);
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

/* ── Proxy Fetch Logic ─────────────────────────────────────────── */

/**
 * Fetch a remote URL and return its body + headers.
 * @param {string} targetUrl - The URL to fetch.
 * @param {string} method - HTTP method (GET or HEAD).
 * @returns {Promise<{ status: number, headers: Record<string, string>, body: string, url: string }>}
 */
function proxyFetch(targetUrl, method = "GET") {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === "https:" ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        "User-Agent":
          "WebMCP-Analyzer/1.0 (+https://jmrp.io/tools/webmcp-analyzer/)",
        Accept:
          "text/html,application/json,application/xml,text/javascript,*/*;q=0.8",
      },
      timeout: REQUEST_TIMEOUT,
    };

    const req = client.request(options, (res) => {
      // Handle redirects (up to 5)
      if (
        [301, 302, 303, 307, 308].includes(res.statusCode) &&
        res.headers.location
      ) {
        const redirectUrl = new URL(res.headers.location, targetUrl).href;
        // Prevent infinite redirects
        const redirectCount = (options._redirectCount || 0) + 1;
        if (redirectCount > 5) {
          reject(new Error("Too many redirects"));
          return;
        }
        res.resume(); // Consume response to free up socket
        proxyFetch(redirectUrl, method).then(resolve).catch(reject);
        return;
      }

      const chunks = [];
      let totalSize = 0;

      res.on("data", (chunk) => {
        totalSize += chunk.length;
        if (totalSize > MAX_RESPONSE_SIZE) {
          res.destroy();
          reject(
            new Error(
              `Response too large (>${MAX_RESPONSE_SIZE / 1024 / 1024} MB)`,
            ),
          );
          return;
        }
        chunks.push(chunk);
      });

      res.on("end", () => {
        const responseHeaders = {};
        for (const [key, value] of Object.entries(res.headers)) {
          // Flatten arrays (e.g., set-cookie)
          responseHeaders[key] = Array.isArray(value)
            ? value.join("; ")
            : value;
        }

        resolve({
          status: res.statusCode,
          headers: responseHeaders,
          body: Buffer.concat(chunks).toString("utf-8"),
          url: targetUrl,
        });
      });

      res.on("error", reject);
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request timed out after ${REQUEST_TIMEOUT / 1000}s`));
    });

    req.on("error", reject);
    req.end();
  });
}

/* ── HTTP Server ───────────────────────────────────────────────── */

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }

  // Only GET and HEAD
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendError(res, 405, "Method not allowed");
    return;
  }

  // Parse request URL
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

  // Health check
  if (reqUrl.pathname === "/health") {
    sendSuccess(res, { status: "ok", service: "webmcp-proxy" });
    return;
  }

  // Only handle root path (Nginx strips /api/proxy/fetch prefix)
  if (reqUrl.pathname !== "/") {
    sendError(res, 404, "Not found");
    return;
  }

  // Rate limiting
  const clientIp =
    req.headers["x-real-ip"] ||
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress;
  if (!checkRateLimit(clientIp)) {
    sendError(res, 429, "Rate limit exceeded. Try again in 1 minute.");
    return;
  }

  // Get target URL
  const targetUrl = reqUrl.searchParams.get("url");
  if (!targetUrl) {
    sendError(res, 400, "Missing ?url= parameter");
    return;
  }

  // Validate URL scheme
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    sendError(res, 400, "Invalid URL");
    return;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    sendError(res, 400, "Only http/https URLs are allowed");
    return;
  }

  // SSRF prevention: resolve hostname and check for private IPs
  try {
    await resolveAndValidate(parsed.hostname);
  } catch (err) {
    sendError(res, 403, err.message);
    return;
  }

  // Determine method for proxied request
  const proxyMethod =
    reqUrl.searchParams.get("method") === "HEAD" ? "HEAD" : "GET";

  // Perform the proxied fetch
  try {
    const result = await proxyFetch(targetUrl, proxyMethod);
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, 502, `Proxy fetch failed: ${err.message}`);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[WebMCP Proxy] Listening on http://127.0.0.1:${PORT}`);
  console.log(
    `[WebMCP Proxy] Rate limit: ${RATE_LIMIT_MAX} req/${RATE_LIMIT_WINDOW / 1000}s per IP`,
  );
  console.log(
    `[WebMCP Proxy] Max response size: ${MAX_RESPONSE_SIZE / 1024 / 1024} MB`,
  );
});

server.on("error", (err) => {
  console.error(`[WebMCP Proxy] Server error: ${err.message}`);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[WebMCP Proxy] Shutting down...");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  console.log("[WebMCP Proxy] Interrupted, shutting down...");
  server.close(() => process.exit(0));
});
