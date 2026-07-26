/**
 * CSP Reporter Policy Replay
 *
 * Replays a `logs/csp-violations.log` file through the reporter's filter chain
 * and notification policy, and prints how many Telegram messages the *previous*
 * policy would have sent versus the current one, broken down by reason.
 *
 * The log is the reporter's own forensic record (one JSON object per line:
 * `{ timestamp, ip, ua, report }`), so a replay is an exact rehearsal of
 * `processReport()` against real production traffic — no synthetic fixtures.
 *
 * Usage:
 *   node scripts/csp-replay.mjs [path/to/csp-violations.log]
 *
 * Exit code is 0 unless the log cannot be read, so it is safe to run in CI.
 */

import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  getDiscardReason,
  getNotificationKey,
  getNotifySuppressReason,
} from "./utils/csp-filters.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_LOG = join(__dirname, "../logs/csp-violations.log");
const RATE_LIMIT_WINDOW = 10 * 60 * 1000;

/**
 * Reads a violations log into entries, skipping unparsable lines.
 *
 * @param {string} path - Path to the JSON-lines log file.
 * @returns {{ entries: Array<Record<string, any>>, skipped: number }}
 */
function readLog(path) {
  const entries = [];
  let skipped = 0;
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      skipped += 1;
    }
  }
  return { entries, skipped };
}

/**
 * Extracts the inner csp-report object.
 *
 * @param {Record<string, any>} entry - One log entry.
 * @returns {Record<string, any>} The violation body.
 */
function violation(entry) {
  return entry.report?.["csp-report"] ?? entry.report ?? {};
}

/**
 * Human-readable signature of a violation, used for the notification breakdown.
 *
 * @param {Record<string, any>} r - The violation body.
 * @returns {string} `directive | blocked-uri | document path`.
 */
function signature(r) {
  const directive = r["effective-directive"] || r["violated-directive"] || "?";
  const blocked = r["blocked-uri"] || "inline/eval";
  let path = r["document-uri"] || "";
  try {
    path = new URL(path).pathname;
  } catch {
    /* keep the raw value */
  }
  return `${directive} | ${blocked} | ${path}`;
}

/**
 * Replays the log under one policy and returns the notifications it produces.
 *
 * @param {Array<Record<string, any>>} entries - Log entries in arrival order.
 * @param {object} policy - Policy switches.
 * @param {boolean} policy.suppressCrawlers - Apply `getNotifySuppressReason()`.
 * @param {"ip"|"signature"} policy.rateLimitKey - Rate-limit key strategy.
 * @returns {{ notified: Array<Record<string, any>>, reasons: Map<string, number> }}
 */
function replay(entries, policy) {
  const cache = new Map();
  const notified = [];
  const reasons = new Map();

  const bump = (key) => reasons.set(key, (reasons.get(key) ?? 0) + 1);

  for (const entry of entries) {
    const r = violation(entry);
    const discard = getDiscardReason(entry.report);
    if (discard) {
      bump(`discarded:${discard}`);
      continue;
    }

    if (policy.suppressCrawlers) {
      const suppress = getNotifySuppressReason(
        entry.report,
        entry.ua,
        entry.ip,
      );
      if (suppress) {
        bump(`logged-not-notified:${suppress}`);
        continue;
      }
    }

    const key =
      policy.rateLimitKey === "ip"
        ? `${entry.ip}:${r["blocked-uri"] || "inline/eval"}`
        : getNotificationKey(entry.report);
    const now = Date.parse(entry.timestamp);
    const last = cache.get(key);
    if (last && now - last < RATE_LIMIT_WINDOW) {
      bump("rate-limited");
      continue;
    }
    cache.set(key, now);
    notified.push(entry);
  }

  return { notified, reasons };
}

/**
 * Prints a sorted `count  label` table.
 *
 * @param {Map<string, number>|Array<[string, number]>} counts - Counter entries.
 * @returns {void}
 */
function printCounts(counts) {
  const rows = [...counts].sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) {
    console.log("    (none)");
    return;
  }
  for (const [label, count] of rows) {
    console.log(`    ${String(count).padStart(5)}  ${label}`);
  }
}

const logPath = process.argv[2] ?? DEFAULT_LOG;
if (!fs.existsSync(logPath)) {
  console.error(`Log file not found: ${logPath}`);
  process.exit(1);
}

const { entries, skipped } = readLog(logPath);
if (entries.length === 0) {
  console.error(`No parsable entries in ${logPath}`);
  process.exit(1);
}

// Extracted rather than interpolated inline: a template literal nested inside
// another is hard to read and flagged by Sonar (javascript:S4624).
const skippedNote = skipped ? ` (${skipped} unparsable)` : "";

console.log(`Log:      ${logPath}`);
console.log(`Entries:  ${entries.length}${skippedNote}`);
console.log(`Range:    ${entries[0].timestamp} → ${entries.at(-1).timestamp}`);

// "Before": crawler reports notified like any other, rate limit keyed on the IP.
const before = replay(entries, {
  suppressCrawlers: false,
  rateLimitKey: "ip",
});
// "After": crawler reports logged but not notified, rate limit keyed on the
// violation signature.
const after = replay(entries, {
  suppressCrawlers: true,
  rateLimitKey: "signature",
});

console.log(`\nTelegram notifications BEFORE: ${before.notified.length}`);
printCounts(
  before.notified.reduce((acc, entry) => {
    const sig = signature(violation(entry));
    acc.set(sig, (acc.get(sig) ?? 0) + 1);
    return acc;
  }, new Map()),
);

console.log(`\nTelegram notifications AFTER:  ${after.notified.length}`);
printCounts(
  after.notified.reduce((acc, entry) => {
    const sig = signature(violation(entry));
    acc.set(sig, (acc.get(sig) ?? 0) + 1);
    return acc;
  }, new Map()),
);

console.log("\nWhy each report was filtered (current policy):");
printCounts(after.reasons);

// Who exactly got silenced by the new crawler tier — printed so the
// classification can be eyeballed instead of trusted.
const silencedClients = new Map();
for (const entry of entries) {
  if (getDiscardReason(entry.report)) continue;
  const reason = getNotifySuppressReason(entry.report, entry.ua, entry.ip);
  if (!reason) continue;
  const label = `${reason}  ${entry.ua.slice(0, 70)}`;
  silencedClients.set(label, (silencedClients.get(label) ?? 0) + 1);
}
console.log("\nClients silenced by the crawler tier (all must be crawlers):");
printCounts(silencedClients);

// Safety assertion: every *kind* of violation seen from a non-crawler client
// must still reach Telegram. Only rate limiting may collapse repeats of a kind,
// never remove the kind itself.
const nonCrawlerKinds = new Set();
for (const entry of entries) {
  if (getDiscardReason(entry.report)) continue;
  if (getNotifySuppressReason(entry.report, entry.ua, entry.ip)) continue;
  nonCrawlerKinds.add(getNotificationKey(entry.report));
}
const notifiedKinds = new Set(
  after.notified.map((entry) => getNotificationKey(entry.report)),
);
const lost = [...nonCrawlerKinds.difference(notifiedKinds)];

console.log(
  `\nNon-crawler violation kinds in the log: ${nonCrawlerKinds.size}` +
    ` — still notified: ${notifiedKinds.size}`,
);
if (lost.length === 0) {
  console.log("PASS: no non-crawler violation kind was silenced.");
} else {
  console.log("FAIL: these non-crawler violation kinds are never notified:");
  printCounts(lost.map((kind) => [kind, 0]));
  process.exitCode = 1;
}
