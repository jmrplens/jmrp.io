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

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Loads environment variables from .env file manually
 */
function loadEnv() {
  const envPath = join(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    content.split("\n").forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || "";
        if (value.startsWith('"') && value.endsWith('"'))
          value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'"))
          value = value.slice(1, -1);
        process.env[key] = value;
      }
    });
  }
}

loadEnv();

// Port for the CSP reporter; can be overridden via the CSP_REPORTER_PORT environment variable.
const DEFAULT_PORT = 58291;
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
const MAX_BODY_SIZE = 10 * 1024; // 10KB limit for CSP reports

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

    req.on("data", (chunk) => {
      body += chunk.toString();
      // Enforce maximum body size
      if (body.length > MAX_BODY_SIZE) {
        console.warn(`Request body exceeded limit from IP: ${clientIp}`);
        res.writeHead(413, { "Content-Type": "text/plain" });
        res.end("Payload Too Large");
        req.destroy();
      }
    });

    req.on("end", () => {
      if (res.writableEnded) return;
      try {
        const report = JSON.parse(body);
        processReport(report, clientIp, userAgent);
        res.writeHead(204);
        res.end();
      } catch (e) {
        console.error("Error parsing CSP report JSON:", e.message);
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
 * Processes the received report and handles logging/notification
 */
function processReport(report, ip, ua) {
  const r = report["csp-report"] || report;
  if (!r) return;

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
 * Escapes HTML for Telegram message compatibility
 */
function escapeHTML(str) {
  if (!str) return "N/A";
  return str.replaceAll(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[m],
  );
}

/**
 * Sends the violation report to Telegram
 */
function sendToTelegram(report, ip, ua) {
  const r = report["csp-report"] || report;
  const date = new Date().toLocaleString("en-GB", {
    timeZone: "Europe/Madrid",
  });

  let sample = (r["script-sample"] || "N/A").replaceAll(/\n/g, " ").trim();
  if (sample.length > 100) sample = sample.substring(0, 97) + "...";

  // Safely handle document-uri
  const rawDocUri = r["document-uri"] || "";
  const escapedDocUri = escapeHTML(rawDocUri || "about:blank");
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
    `🌐 <b>IP:</b> <code>${escapeHTML(ip)}</code>`,
    `📄 <b>Doc:</b> <a href="${escapedDocUri}">${escapeHTML(docPath)}</a>`,
    `🚫 <b>Blocked:</b> <code>${escapeHTML(r["blocked-uri"] || "inline/eval")}</code>`,
    `🛠️ <b>Directive:</b> <code>${escapeHTML(r["violated-directive"])}</code>`,
    `🔍 <b>Sample:</b> <code>${escapeHTML(sample)}</code>`,
    `📱 <b>UA:</b> <code>${escapeHTML(ua.substring(0, 80))}</code>`,
  ];

  const caption = lines.join("\n");
  const fullReport = JSON.stringify(
    { metadata: { timestamp: new Date().toISOString(), ip, ua }, report },
    null,
    2,
  );
  const boundary =
    "----WebKitFormBoundary" + Math.random().toString(36).substring(2);

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
