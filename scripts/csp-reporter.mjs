/**
 * CSP Violation Reporter Server
 *
 * A simple HTTP server that listens for Content-Security-Policy (CSP) violation reports.
 *
 * Key Features:
 * - Logs all violations to a local file (logs/csp-violations.log).
 * - Sends instant notifications to a Telegram chat using a bot.
 * - Implements basic rate limiting to avoid spamming Telegram during attacks.
 * - Handles Payload Too Large (413) and Invalid JSON (400) errors gracefully.
 *
 * Setup:
 * Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in environment variables or .env file.
 */

import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { escapeHtml } from "./utils/html.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Loads environment variables from .env file
 */
function loadEnv() {
  const envPath = join(__dirname, "../.env");
  try {
    if (fs.existsSync(envPath)) {
      process.loadEnvFile(envPath);
    }
  } catch (error) {
    console.warn(
      `[CSP Reporter] Warning: Failed to load .env file: ${error.message}`,
    );
  }
}

loadEnv();

// Port for the CSP reporter; can be overridden via the CSP_REPORTER_PORT environment variable.
const DEFAULT_PORT = 58_291;
const PORT = (() => {
  const envPort = process.env.CSP_REPORTER_PORT;
  if (!envPort) return DEFAULT_PORT;
  const parsed = Number.parseInt(envPort, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? DEFAULT_PORT : parsed;
})();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const LOG_FILE = join(__dirname, "../logs/csp-violations.log");
const RATE_LIMIT_WINDOW = 10 * 60 * 1000; // 10 minutes window for repeated reports
const MAX_BODY_SIZE = 32 * 1024; // 32KB limit for CSP reports

// In-memory cache for rate limiting: { "ip:blocked-uri": last_timestamp }
const reportCache = new Map();

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  const missingVars = [];
  if (!TELEGRAM_BOT_TOKEN) missingVars.push("TELEGRAM_BOT_TOKEN");
  if (!TELEGRAM_CHAT_ID) missingVars.push("TELEGRAM_CHAT_ID");
  console.error(
    `Missing required environment variable(s): ${missingVars.join(", ")}. ` +
      `Please set them in your environment or in the .env file located at ${join(__dirname, "../.env")}.`,
  );
  process.exit(1);
}

// Ensure log directory exists
const logDir = dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * Main HTTP Server
 */
// deepcode ignore HttpToHttps: This server runs behind a reverse proxy (Nginx) which handles HTTPS.
const server = http.createServer((req, res) => {
  if (req.method === "POST") {
    let body = "";
    const clientIp = (
      req.headers["x-real-ip"] ||
      req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress ||
      "Unknown"
    )
      .split(",")[0]
      .trim();
    const userAgent = (req.headers["user-agent"] || "Unknown").trim();

    let responded = false;
    let bodyBytes = 0;

    req.on("data", (chunk) => {
      if (responded) return;

      body += chunk.toString();
      bodyBytes += chunk.length;
      // Enforce maximum body size
      if (bodyBytes > MAX_BODY_SIZE) {
        console.warn(`Request body exceeded limit from IP: ${clientIp}`);
        responded = true;
        res.writeHead(413, { "Content-Type": "text/plain" });
        res.end("Payload Too Large");
        req.destroy();
      }
    });

    req.on("end", () => {
      if (responded || res.writableEnded) return;
      responded = true;
      try {
        const report = JSON.parse(body);
        processReport(report, clientIp, userAgent);
        res.writeHead(204);
        res.end();
      } catch (error) {
        console.error("Error parsing CSP report JSON:", error);
        res.writeHead(400);
        res.end("Invalid JSON");
      }
    });
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

/**
 * Checks whether a CSP violation was caused by a browser extension rather than
 * by the page itself. Extensions inject scripts and styles that lack the page's
 * nonce, producing harmless "inline" violations that are safe to ignore.
 *
 * Detection heuristics:
 * - source-file points to an extension protocol (moz-extension://, chrome-extension://, safari-extension://)
 * - source-file is "<anonymous code>" (Firefox reports extension-injected styles this way)
 * - blocked-uri points to an extension protocol
 *
 * @param {Record<string, unknown>} r - The csp-report object
 * @returns {boolean} true if the violation is from a browser extension
 */
function isExtensionViolation(r) {
  const rawSource = r["source-file"];
  const rawBlocked = r["blocked-uri"];
  const source = typeof rawSource === "string" ? rawSource : "";
  const blocked = typeof rawBlocked === "string" ? rawBlocked : "";

  const extensionPatterns =
    /^(moz-extension|chrome-extension|safari-extension|safari-web-extension|ms-browser-extension):/i;

  if (extensionPatterns.test(source) || extensionPatterns.test(blocked)) {
    return true;
  }

  // Firefox reports extension-injected <style> elements with source-file "<anonymous code>"
  // and very high line numbers from the extension's bundled script
  if (source === "<anonymous code>") {
    return true;
  }

  return false;
}

/**
 * Processes the received report and handles logging/notification
 */
function processReport(report, ip, ua) {
  const r = report["csp-report"] || report;
  if (!r) return;

  // Silently discard violations caused by browser extensions (Dark Reader, ad blockers, etc.)
  // These inject <style>/<script> elements without the page nonce, producing expected violations.
  if (isExtensionViolation(r)) {
    return;
  }

  const blockedUri = r["blocked-uri"] || "inline/eval";
  const cacheKey = `${ip}:${blockedUri}`;
  const now = Date.now();

  // Log everything to file for audit history
  const logEntry =
    JSON.stringify({
      timestamp: new Date().toISOString(),
      ip,
      ua,
      report,
    }) + "\n";

  fs.appendFile(LOG_FILE, logEntry, (err) => {
    if (err) console.error("Error writing to log file:", err);
  });

  // Rate limit Telegram notifications to prevent flooding during attacks or dev issues
  const lastReport = reportCache.get(cacheKey);
  if (lastReport && now - lastReport < RATE_LIMIT_WINDOW) {
    return;
  }

  reportCache.set(cacheKey, now);
  sendToTelegram(report, ip, ua);

  // Clean up cache periodically (every hour)
  if (reportCache.size > 1000) {
    const oneHourAgo = now - 60 * 60 * 1000;
    for (const [key, timestamp] of reportCache.entries()) {
      if (timestamp < oneHourAgo) reportCache.delete(key);
    }
  }
}

/**
 * Sends the violation report to Telegram
 */
function sendToTelegram(report, ip, ua) {
  const r = report["csp-report"] || report;
  const date = new Date().toLocaleString("en-GB", {
    timeZone: "Europe/Madrid",
  });

  let sample = (r["script-sample"] || "N/A").replaceAll("\n", " ").trim();
  if (sample.length > 100) sample = sample.slice(0, 97) + "...";

  // Safely handle document-uri
  const rawDocUri = r["document-uri"] || "";
  const escapedDocUri = escapeHtml(rawDocUri || "about:blank");
  let docPath = rawDocUri || "N/A";
  try {
    if (rawDocUri) {
      docPath = new URL(rawDocUri).pathname || rawDocUri;
    }
  } catch {
    docPath = rawDocUri || "N/A";
  }

  // Build message using HTML mode for better control
  const lines = [
    `🛡️ <b>CSP Violation Detected</b>`,
    ``,
    `📅 <b>Date:</b> ${date}`,
    `🌐 <b>IP:</b> <code>${escapeHtml(ip)}</code>`,
    `📄 <b>Doc:</b> <a href="${escapedDocUri}">${escapeHtml(docPath)}</a>`,
    `🚫 <b>Blocked:</b> <code>${escapeHtml(r["blocked-uri"] || "inline/eval")}</code>`,
    `🛠️ <b>Directive:</b> <code>${escapeHtml(r["violated-directive"])}</code>`,
    `🔍 <b>Sample:</b> <code>${escapeHtml(sample)}</code>`,
    `📱 <b>UA:</b> <code>${escapeHtml(ua.slice(0, 80))}</code>`,
  ];

  const caption = lines.join("\n");
  const fullReport = JSON.stringify(
    { metadata: { timestamp: new Date().toISOString(), ip, ua }, report },
    null,
    2,
  );
  const boundary =
    "----WebKitFormBoundary" +
    // eslint-disable-next-line sonarjs/pseudo-random -- boundary delimiter, not security-sensitive
    Math.random().toString(36).slice(2);

  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${TELEGRAM_CHAT_ID}\r\n`,
    ),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`,
    ),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nHTML\r\n`,
    ),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="csp-report-${Date.now()}.json"\r\nContent-Type: application/json\r\n\r\n${fullReport}\r\n`,
    ),
    Buffer.from(`--${boundary}--\r\n`),
  ]);

  const req = https.request({
    hostname: "api.telegram.org",
    port: 443,
    path: `/bot${TELEGRAM_BOT_TOKEN}/sendDocument`,
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": payload.length,
    },
  });

  req.on("response", (res) => {
    let resBody = "";
    res.setEncoding("utf8");
    res.on("data", (chunk) => (resBody += chunk));
    res.on("end", () => {
      if (res.statusCode !== 200) {
        const statusCode = Number(res.statusCode);
        console.error("Telegram API HTTP Error (%d): %s", statusCode, resBody);
        return;
      }
      try {
        const parsed = JSON.parse(resBody);
        if (parsed?.ok) {
          console.log("CSP report sent to Telegram successfully");
        } else {
          console.error("Telegram API Logic Error (ok=false):", resBody);
        }
      } catch {
        console.error("Telegram API Non-JSON response:", resBody);
      }
    });
  });

  req.on("error", (e) => {
    console.error("Telegram Error sending CSP report:", {
      error: e.message,
      ip,
      ua,
      report,
    });
  });

  req.write(payload);
  req.end();
}

// Binds to 127.0.0.1 as it is intended to work behind a reverse proxy (like Nginx)
server.listen(PORT, "127.0.0.1", () => {
  console.log(`CSP Reporter listening on 127.0.0.1:${PORT}`);
});
