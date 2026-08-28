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

import {
  getDiscardReason,
  getNotificationKey,
  getNotifySuppressReason,
} from "./utils/csp-filters.mjs";
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

// In-memory cache for notification rate limiting, keyed by violation signature
// (see getNotificationKey()) rather than by client IP.
const reportCache = new Map();

// Filtered-report metrics: { "stage:reason" -> count }. Filtered reports
// (payloads rejected before parsing, discarded false positives, plus crawler
// reports that are logged but never notified) are invisible on Telegram, so
// without a counter their volume and mix cannot be reviewed. Dumped to the
// console every FILTER_LOG_INTERVAL hits. Every early exit on the request path
// records here, so the `reject:*` and `discard:*` counts plus the log line
// count give the true intake (`no-notify:*` reports are in the log already).
const filterCounts = new Map();
let totalFiltered = 0;
const FILTER_LOG_INTERVAL = 100;

/**
 * Records a filtered CSP report and periodically logs a summary of every
 * filter reason seen so far.
 *
 * @param {"reject"|"discard"|"no-notify"} stage - Whether the payload was
 *   rejected before parsing, the report was dropped entirely, or it was only
 *   kept off Telegram.
 * @param {string} reason - Short reason string from the filter chain.
 * @returns {void}
 */
function recordFiltered(stage, reason) {
  const key = `${stage}:${reason}`;
  filterCounts.set(key, (filterCounts.get(key) ?? 0) + 1);
  totalFiltered += 1;

  if (totalFiltered % FILTER_LOG_INTERVAL === 0) {
    const summary = [...filterCounts]
      .sort((a, b) => b[1] - a[1])
      .map(([r, count]) => `${r}=${count}`)
      .join(", ");
    console.log(
      `[CSP Reporter] Filtered ${totalFiltered} reports so far (${summary})`,
    );
  }
}

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
      .split(",", 1)[0]
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
        recordFiltered("reject", "payload-too-large");
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
        const parsed = JSON.parse(body);
        // The Reporting API (report-to, added 2026-08-22 alongside the legacy
        // report-uri — see csp.ts B24) sends {type, url, body} envelopes with
        // camelCase keys, unlike the legacy single {"csp-report": {…}} object
        // with kebab-case. Normalize every accepted shape to the legacy one so
        // the downstream consumers (filters, dedup, Telegram) keep working
        // unchanged.
        for (const report of normalizeReports(parsed)) {
          processReport(report, clientIp, userAgent);
        }
        res.writeHead(204);
        res.end();
      } catch (error) {
        console.error("Error parsing CSP report JSON:", error);
        recordFiltered("reject", "invalid-json");
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
 * Detects a Reporting API envelope (`{type, url, age, user_agent, body}`).
 *
 * Anything already carrying a "csp-report" key is a legacy report and must be
 * passed through untouched.
 *
 * @param {unknown} entry - A parsed payload, or one entry of a payload array.
 * @returns {boolean} True when the value is a Reporting API envelope.
 */
function isReportingApiEnvelope(entry) {
  return (
    !!entry &&
    typeof entry === "object" &&
    !("csp-report" in entry) &&
    typeof entry.type === "string" &&
    !!entry.body &&
    typeof entry.body === "object" &&
    // An array is an object: without this, `{type, body: []}` passed as an
    // envelope and every field came out undefined on the other side.
    !Array.isArray(entry.body)
  );
}

/**
 * Maps one Reporting API envelope onto the legacy `{"csp-report": {…}}` shape,
 * translating its camelCase fields to the kebab-case names the rest of this
 * file reads.
 *
 * @param {Record<string, unknown>} entry - A `type: "csp-violation"` envelope.
 * @returns {Record<string, unknown>} The equivalent legacy-shaped report.
 */
function reportingApiToLegacy(entry) {
  const b = entry.body || {};
  return {
    "csp-report": {
      // The envelope repeats the document URL in its own `url` field; some UAs
      // populate only that one.
      "document-uri": b.documentURL ?? entry.url,
      referrer: b.referrer,
      "blocked-uri": b.blockedURL,
      "violated-directive": b.effectiveDirective,
      "effective-directive": b.effectiveDirective,
      "original-policy": b.originalPolicy,
      disposition: b.disposition,
      "status-code": b.statusCode,
      "script-sample": b.sample,
      "source-file": b.sourceFile,
      "line-number": b.lineNumber,
      "column-number": b.columnNumber,
    },
  };
}

/**
 * Normalizes an incoming payload to a list of legacy-shaped CSP reports.
 *
 * Three shapes reach this endpoint in production: the legacy single
 * `{"csp-report": {…}}` object, the spec's ARRAY of Reporting API envelopes,
 * and — this is the one that used to slip through — a BARE envelope object.
 * That last case was returned as-is, so every kebab-case field read downstream
 * came back `undefined`: 10 genuine violations were logged with an empty body
 * between 2026-08-22 (when `report-to` was added) and the fix.
 *
 * @param {unknown} parsed - The parsed JSON request body.
 * @returns {Array<Record<string, unknown>>} Legacy-shaped reports to process.
 */
function normalizeReports(parsed) {
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const reports = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      recordFiltered("discard", "malformed");
      continue;
    }
    if (!isReportingApiEnvelope(entry)) {
      // Anything that is not an envelope must be a legacy report, and a legacy
      // report is exactly `{"csp-report": {…}}`. Accepting every other object
      // let shapes with no CSP fields at all through to the notify path, which
      // is the same class of bug as the envelope one: a payload nobody could
      // read, counted as if it had been.
      const legacy = entry["csp-report"];
      if (!legacy || typeof legacy !== "object" || Array.isArray(legacy)) {
        recordFiltered("discard", "malformed");
        continue;
      }
      reports.push(entry);
      continue;
    }
    // Reporting-Endpoints only asks for csp-violation, but a UA may batch other
    // report types (deprecation, intervention…) into the same POST. They carry
    // none of the fields below, so they must never reach the notify path.
    if (entry.type !== "csp-violation") {
      recordFiltered("discard", "non-csp-report");
      continue;
    }
    reports.push(reportingApiToLegacy(entry));
  }

  return reports;
}

/**
 * Processes the received report and handles logging/notification
 */
function processReport(report, ip, ua) {
  // Defensive check: report must be an object (parsed JSON). Counted, so the
  // filter totals stay reconcilable against the log.
  if (!report || typeof report !== "object") {
    recordFiltered("discard", "malformed");
    return;
  }
  const r = report["csp-report"] || report;
  if (!r || typeof r !== "object") {
    recordFiltered("discard", "malformed");
    return;
  }

  // Silently discard reports that cannot describe the site's own behavior
  // (browser extensions, antivirus, userscripts, browser-internal pages,
  // prefetch quirks and extension/translator-injected resources). The site's
  // own pages are verified CSP-clean on a real browser, so these never indicate
  // an actionable issue. See scripts/utils/csp-filters.mjs and docs/CSP_REPORTER.md.
  const discardReason = getDiscardReason(report);
  if (discardReason) {
    recordFiltered("discard", discardReason);
    return;
  }

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

  // Crawler traffic is kept in the log above but never notified: it was 95% of
  // the Telegram volume and none of it is reproducible in a browser.
  const suppressReason = getNotifySuppressReason(report, ua, ip);
  if (suppressReason) {
    recordFiltered("no-notify", suppressReason);
    return;
  }

  // Rate limit Telegram notifications to prevent flooding during attacks or dev issues
  const cacheKey = getNotificationKey(report);
  const lastReport = reportCache.get(cacheKey);
  if (lastReport && now - lastReport < RATE_LIMIT_WINDOW) {
    return;
  }

  reportCache.set(cacheKey, now);
  sendToTelegram(report, ip, ua);

  // Clean up cache periodically (every hour)
  if (reportCache.size > 1000) {
    const oneHourAgo = now - 60 * 60 * 1000;
    for (const [key, timestamp] of reportCache) {
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
