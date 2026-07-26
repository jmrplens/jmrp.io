/**
 * CSP Violation False-Positive Filters
 *
 * Shared predicates that decide whether a CSP violation report is a known
 * false positive (browser extension, antivirus injection, userscript, browser
 * translator, crawler, prefetch quirk, …) rather than a real, actionable issue
 * with the site itself.
 *
 * The site's own pages are verified to be CSP-clean on a real browser, so no
 * violation matching one of these predicates is actionable. They are filtered
 * at two different depths:
 *
 * - `getDiscardReason()` — dropped outright, never logged. Reserved for reports
 *   that cannot describe the site's own behavior at all (extension protocols,
 *   browser-internal URIs, the documented `prefetch-src` fallback).
 * - `getNotifySuppressReason()` — written to `logs/csp-violations.log` but kept
 *   off Telegram. Reserved for crawler traffic, whose classification is an
 *   inference and therefore worth keeping the evidence for.
 *
 * See docs/CSP_REPORTER.md.
 */

/** Matches jmrp.io and any of its subdomains (e.g. cdn.jmrp.io). */
const OWN_ORIGIN = /(^|\.)jmrp\.io$/i;

/** Browser/extension origins the site never references but that are injected
 *  by in-browser translators and extensions (fonts, icons, iframes, beacons). */
const TRANSLATOR_EXTENSION_HOSTS =
  /(^|\.)(translate\.google\.com|translate\.googleapis\.com|gstatic\.com|yastatic\.net|r2cdn\.perplexity\.ai|div\.show|translator\.microsoft\.com|edge\.microsoft\.com|deepl\.com)$/i;

/** Antivirus/security-suite hosts known to inject `<script>`/`<style>`
 *  elements into pages under their protection (Kaspersky Protection, Avast
 *  Online Security, AVG, ESET, McAfee WebAdvisor, Malwarebytes Browser
 *  Guard, Bitdefender TrafficLight, …). */
const AV_EXTENSION_HOSTS =
  /(^|\.)(kaspersky-labs\.com|avast\.com|avcdn\.net|avg\.com|eset\.com|mcafee\.com|malwarebytes\.com|bitdefender\.net|bitdefender\.com)$/i;

/**
 * Generic bot/crawler keywords, matched with the suffix regex built below.
 *
 * Crawler names put the keyword at the *end* of a token ("Googlebot",
 * "YandexBot", "YisouSpider", "bingbot"), so the keyword is preceded by a
 * letter and a leading `\b` never matches — the previous `\b(bot|…)\b` regex
 * silently let every one of those through. Evidence: over 49 days of the
 * production log, 167 reports came from `YandexBot`/`YandexRenderResourcesBot`
 * and were all classified as real traffic.
 */
const GENERIC_BOT_UA_KEYWORDS = [
  "bots?",
  "crawler",
  "crawl",
  "spiders?",
  "slurp",
];

/**
 * Suffix regex built from {@link GENERIC_BOT_UA_KEYWORDS}: the keyword must end
 * a token (not be followed by another letter). This matches "Googlebot/2.1",
 * "YandexBot/3.0", "YisouSpider", "yandex.com/bots)" while still rejecting
 * "RobotVacuum" / "Robotics" / "automotive" / "spidering", where the keyword is
 * followed by more letters (see csp-filters.test.mjs).
 */
const GENERIC_BOT_UA_REGEX = new RegExp(
  `(${GENERIC_BOT_UA_KEYWORDS.join("|")})(?![a-z])`,
  "i",
);

/**
 * Specific bot/tool user-agent identifiers matched with plain `String.includes`.
 * Needed for names that embed a generic keyword without a word boundary
 * before it (e.g. "GPTBot", "AhrefsBot", "ByteSpider" — the "B"/"S" is
 * preceded by a letter, not a boundary, so the generic regex above can't see
 * it) as well as identifiers that aren't generic keywords at all.
 */
const SPECIFIC_BOT_UA_TOKENS = [
  // Automation / scraping tools and HTTP libraries.
  "facebookexternalhit",
  "meta-externalagent",
  "embedly",
  "headlesschrome",
  "phantomjs",
  "puppeteer",
  "playwright",
  "python-requests",
  "python-urllib",
  "aiohttp",
  "go-http-client",
  "java/",
  "libwww",
  "okhttp",
  "axios/",
  "node-fetch",
  "curl/",
  "wget/",
  // AI crawlers / assistants.
  "bytespider",
  "gptbot",
  "oai-searchbot",
  "chatgpt-user",
  "claudebot",
  "claude-web",
  "anthropic-ai",
  "perplexitybot",
  "amazonbot",
  "applebot",
  // SEO / indexing crawlers.
  "ahrefsbot",
  "semrushbot",
  "dataforseo",
  "google-inspectiontool",
];

/**
 * Netblocks operated by search-engine crawler infrastructure.
 *
 * Some crawlers fetch and re-render pages with a *browser* user-agent, so
 * {@link isBotUserAgent} cannot see them. In the production log, 60 of the 490
 * surviving reports (12%) were `script-src-elem` `'inline'` violations sent
 * from 21 distinct addresses in 64.233.172.0/24, 74.125.209-210.0/24 and
 * 66.249.88.0/24 — all Google — under two obviously synthetic UAs: a frozen
 * `Chrome/121` on `X11; Linux x86_64` (Google's rendering service) and
 * `Android 4.3; SM-N900T` (the Google Web Light transcoder). One further
 * report arrived from Yandex's 2a02:6b8::/29 carrying an iPhone UA.
 *
 * Their inline-script violations come from the per-request nonce: these
 * fetchers cache the HTML and the response headers independently, so a
 * re-render pairs HTML holding nonce A with a policy carrying nonce B. That is
 * inherent to nonce-based CSP plus crawler caching, not a site defect.
 *
 * Deliberately restricted to the crawler/edge ranges published by each
 * operator. Google Cloud customer space (34/35.x) is **excluded**: those are
 * rented VMs, i.e. exactly where a scanner or an attacker would run from.
 *
 * Sources: developers.google.com/search/apis/ipranges/googlebot.json and
 * special-crawlers.json; yandex.com/support/webmaster/robot-workings/check-yandex-robots.html
 * (verified 2026-07).
 */
const CRAWLER_NETWORKS = [
  // Google — Googlebot, Google Web Light, rich-results/inspection fetchers.
  "66.249.64.0/19",
  "64.233.160.0/19",
  "74.125.0.0/16",
  "72.14.192.0/18",
  "209.85.128.0/17",
  "216.239.32.0/19",
  "2001:4860:4801::/40",
  // Yandex — YandexBot and the render-resources fetchers.
  "5.45.192.0/18",
  "5.255.192.0/18",
  "37.9.64.0/18",
  "37.140.128.0/18",
  "77.88.0.0/18",
  "84.252.160.0/19",
  "87.250.224.0/19",
  "93.158.128.0/18",
  "95.108.128.0/17",
  "141.8.128.0/18",
  "178.154.128.0/17",
  "213.180.192.0/19",
  "2a02:6b8::/29",
];

/**
 * Converts an IPv4/IPv6 address to a BigInt, or null when unparsable.
 * IPv4-mapped IPv6 (`::ffff:1.2.3.4`) is normalized to its IPv4 form so that
 * a v4 netblock still matches it.
 *
 * @param {string} address - Textual IP address.
 * @returns {{ bits: number, value: bigint } | null}
 */
function ipToBigInt(address) {
  const value = address.trim().toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  const plain = mapped ? mapped[1] : value;

  if (/^\d+\.\d+\.\d+\.\d+$/.test(plain)) {
    const parts = plain.split(".").map(Number);
    if (parts.some((part) => !Number.isSafeInteger(part) || part > 255)) {
      return null;
    }
    return {
      bits: 32,
      value: parts.reduce((acc, part) => (acc << 8n) | BigInt(part), 0n),
    };
  }

  if (!plain.includes(":")) return null;
  if ((plain.match(/::/g) ?? []).length > 1) return null;
  const [head, tail = ""] = plain.split("::", 2);
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  if (missing < 0 || (missing > 0 && !plain.includes("::"))) return null;
  const groups = [
    ...headGroups,
    ...Array.from({ length: Math.max(missing, 0) }, () => "0"),
    ...tailGroups,
  ];
  if (groups.length !== 8) return null;

  let result = 0n;
  for (const group of groups) {
    if (!/^[\da-f]{1,4}$/.test(group)) return null;
    result = (result << 16n) | BigInt(Number.parseInt(group, 16));
  }
  return { bits: 128, value: result };
}

/** Pre-parsed {@link CRAWLER_NETWORKS}, so matching costs no parsing per report. */
const PARSED_CRAWLER_NETWORKS = CRAWLER_NETWORKS.map((cidr) => {
  const [network, prefix] = cidr.split("/", 2);
  const parsed = ipToBigInt(network);
  const prefixLength = Number(prefix);
  const shift = BigInt(parsed.bits - prefixLength);
  return { bits: parsed.bits, shift, base: parsed.value >> shift };
});

/**
 * Whether an IP belongs to a known search-engine crawler netblock
 * ({@link CRAWLER_NETWORKS}).
 *
 * @param {string} ip - Client IP as forwarded by Nginx (`X-Real-IP`).
 * @returns {boolean}
 */
export function isCrawlerNetwork(ip) {
  if (typeof ip !== "string" || !ip) return false;
  const address = ipToBigInt(ip);
  if (!address) return false;
  return PARSED_CRAWLER_NETWORKS.some(
    (net) =>
      net.bits === address.bits && address.value >> net.shift === net.base,
  );
}

/**
 * Returns the hostname of a URI, or "" if it cannot be parsed.
 *
 * @param {string} uri
 * @returns {string}
 */
function hostOf(uri) {
  try {
    return new URL(uri).hostname;
  } catch {
    return "";
  }
}

/**
 * Detects violations caused by browser extensions, antivirus suites and
 * userscript managers. These inject `<style>`/`<script>` elements without the
 * page nonce, producing expected violations.
 *
 * @param {Record<string, unknown>} r - The csp-report object
 * @returns {boolean}
 */
export function isExtensionViolation(r) {
  const source = typeof r["source-file"] === "string" ? r["source-file"] : "";
  const blocked = typeof r["blocked-uri"] === "string" ? r["blocked-uri"] : "";

  // Extension protocols (full URIs and the truncated values some browsers report).
  const extensionProtocols =
    /^(moz-extension|chrome-extension|safari-extension|safari-web-extension|webkit-extension|ms-browser-extension)(:|$)/i;
  if (extensionProtocols.test(source) || extensionProtocols.test(blocked)) {
    return true;
  }

  // Firefox labels extension-injected <style>/<script> as "<anonymous code>".
  if (source === "<anonymous code>") return true;

  // Userscript managers (Tampermonkey, Violentmonkey, Greasemonkey).
  if (source === "user-script" || source === "userscript") return true;

  // Chromium reports extension-sandboxed code with this synthetic source-file.
  if (source === "sandbox eval code") return true;

  // Antivirus/security suites that inject scripts into pages (Kaspersky
  // Protection, Avast, AVG, ESET, McAfee, Malwarebytes, Bitdefender, …).
  // Extract hostname to avoid substring artifacts, then check domain suffix.
  const host = hostOf(source);
  return Boolean(host && AV_EXTENSION_HOSTS.test(host));
}

/**
 * Detects violations originating from browser-internal contexts (about:blank,
 * about:srcdoc, Firefox resource:// scripts, blob: URIs from extensions/devtools).
 *
 * @param {Record<string, unknown>} r - The csp-report object
 * @returns {boolean}
 */
export function isBrowserInternalViolation(r) {
  const source =
    typeof r["source-file"] === "string" ? r["source-file"].toLowerCase() : "";
  const blocked =
    typeof r["blocked-uri"] === "string" ? r["blocked-uri"].toLowerCase() : "";

  if (source === "about" || source.startsWith("about:")) return true;
  // Firefox internal resource:// scripts and styles.
  if (source === "resource" || source.startsWith("resource:")) return true;
  if (source === "blob" || source.startsWith("blob:")) return true;
  return Boolean(blocked === "blob" || blocked.startsWith("blob:"));
}

/**
 * Detects prefetch false positives. Browsers lacking `prefetch-src` support fall
 * back to `default-src` when evaluating same-origin prefetches initiated by
 * Astro's prefetch module, producing spurious violations.
 *
 * @param {Record<string, unknown>} r - The csp-report object
 * @returns {boolean}
 */
export function isPrefetchFalsePositive(r) {
  const rawDirective =
    r["effective-directive"] ?? r["violated-directive"] ?? "";
  const directive = typeof rawDirective === "string" ? rawDirective : "";
  if (directive !== "default-src" && directive !== "prefetch-src") return false;

  const rawBlocked = r["blocked-uri"] ?? "";
  const blockedUri = typeof rawBlocked === "string" ? rawBlocked : "";
  const rawDocument = r["document-uri"] ?? "";
  const documentUri = typeof rawDocument === "string" ? rawDocument : "";
  if (!blockedUri || !documentUri) return false;

  let sameOrigin = false;
  try {
    sameOrigin = new URL(blockedUri).origin === new URL(documentUri).origin;
  } catch {
    return false;
  }
  if (!sameOrigin) return false;

  // Heuristic 1: source is Astro's prefetch module.
  const rawSource = r["source-file"];
  const sourceFile = typeof rawSource === "string" ? rawSource : "";
  if (/_astro\/page\.[A-Za-z0-9_-]+\.js/.test(sourceFile)) return true;

  // Heuristic 2: no source-file but blocked-uri is an HTML page path.
  if (!rawSource) {
    try {
      const blockedPath = new URL(blockedUri).pathname;
      if (blockedPath.endsWith("/") || !blockedPath.includes(".")) return true;
    } catch {
      /* skip */
    }
  }

  return false;
}

/**
 * Detects crawler/bot/automation user-agents. Bots routinely render stale HTML
 * snapshots that reference content-hashed `_astro` chunks from a previous build;
 * after a redeploy those chunks 404 or differ, producing SRI/CSP violations that
 * are not actionable site issues. A genuine, site-wide CSP regression would also
 * surface on real-browser traffic, `pnpm verify` and security.spec.ts.
 *
 * Used by {@link getNotifySuppressReason}, not by {@link getDiscardReason}: bot
 * reports are still written to the log, they just don't page anyone.
 *
 * @param {string} ua - The request User-Agent header
 * @returns {boolean}
 */
export function isBotUserAgent(ua) {
  if (typeof ua !== "string" || !ua) return false;
  const lower = ua.toLowerCase();
  // Use word-boundary regex for "bot/crawl/spider" to avoid false positives on
  // "robot", "robotic", "automotive", etc. Other tokens are unambiguous identifiers.
  if (GENERIC_BOT_UA_REGEX.test(ua)) return true;
  // Check substring matches for unambiguous bot/tool identifiers, including
  // names a word-boundary match can't see (e.g. "GPTBot").
  if (SPECIFIC_BOT_UA_TOKENS.some((token) => lower.includes(token)))
    return true;

  // Chromium UA template missing the mandatory "Chrome/" token → scraper/render
  // bot. Real Chromium browsers always include "Chrome/<version>"; real Safari
  // uses "Version/<n> Safari/605.x", never bare "AppleWebKit/537.36 … Safari/537.36".
  return (
    /AppleWebKit\/537\.36/.test(ua) &&
    /Safari\/537\.36/.test(ua) &&
    !/Chrome\/\d/.test(ua)
  );
}

/**
 * Whether a font-src/media-src violation is an injected resource (data: URI or a
 * remote non-jmrp.io origin). The site restricts both directives to 'self'.
 *
 * @param {string} dir - The effective/violated directive
 * @param {string} blocked - The blocked-uri value
 * @returns {boolean}
 */
function isInjectedFontOrMedia(dir, blocked) {
  if (dir !== "font-src" && dir !== "media-src") return false;
  if (blocked === "data" || blocked.startsWith("data:")) return true;
  if (!/^https?:/i.test(blocked)) return false;
  const host = hostOf(blocked);
  return Boolean(host) && !OWN_ORIGIN.test(host);
}

/**
 * Detects third-party resources injected by extensions or the browser's built-in
 * translator. The site's CSP restricts font-src and media-src to 'self', so any
 * data: URI or remote (non-jmrp.io) font/media is necessarily injected. Also
 * matches known translator/extension origins (Google/Yandex translate, etc.).
 *
 * @param {Record<string, unknown>} r - The csp-report object
 * @returns {boolean}
 */
export function isInjectedThirdPartyResource(r) {
  const dir = r["effective-directive"] || r["violated-directive"] || "";
  const blocked = typeof r["blocked-uri"] === "string" ? r["blocked-uri"] : "";
  const source = typeof r["source-file"] === "string" ? r["source-file"] : "";

  if (isInjectedFontOrMedia(dir, blocked)) return true;

  // connect-src to a data: URI — the site never opens data: connections.
  if (
    dir === "connect-src" &&
    (blocked === "data" || blocked.startsWith("data:"))
  ) {
    return true;
  }

  // Known browser-translator / extension origins (img, frame, beacons, …).
  for (const uri of [blocked, source]) {
    const host = hostOf(uri);
    if (host && TRANSLATOR_EXTENSION_HOSTS.test(host)) return true;
  }

  return false;
}

/**
 * Detects injected inline styles. The site emits styles only via nonce'd <style>
 * elements or utility classes (enforced by the build pipeline and
 * security.spec.ts), so any style-src-elem/attr 'inline' violation is injected by
 * an extension (translators, dark-mode, antivirus, …).
 *
 * NOTE: inline *script* violations are deliberately NOT filtered — an inline-script
 * violation may indicate a real XSS and must always be surfaced.
 *
 * @param {Record<string, unknown>} r - The csp-report object
 * @returns {boolean}
 */
export function isInjectedInlineStyle(r) {
  const dir = r["effective-directive"] || r["violated-directive"] || "";
  const blocked = typeof r["blocked-uri"] === "string" ? r["blocked-uri"] : "";
  // Matches style-src-elem, style-src-attr and the legacy full-policy form some
  // browsers report (e.g. "style-src 'self' 'nonce-…'").
  return (
    dir.startsWith("style-src") && (blocked === "inline" || blocked === "")
  );
}

/**
 * Runs the *discard* filter chain: reports matching it are dropped outright and
 * never reach the log file or Telegram.
 *
 * Only categories that cannot describe the site's own behavior live here — a
 * violation whose source is an extension protocol, a browser-internal URI or
 * the documented `prefetch-src` fallback carries no information about jmrp.io.
 * Everything else (including crawlers) is logged and merely filtered at the
 * notification layer — see {@link getNotifySuppressReason}.
 *
 * @param {Record<string, unknown>} report - The raw report body (may or may not
 *   be wrapped in a "csp-report" key).
 * @returns {string|null} A short reason string when the report should be
 *   discarded, or null when it should be logged.
 */
export function getDiscardReason(report) {
  const r = report["csp-report"] || report;
  if (!r || typeof r !== "object") return "empty";

  if (isExtensionViolation(r)) return "extension";
  if (isBrowserInternalViolation(r)) return "browser-internal";
  if (isPrefetchFalsePositive(r)) return "prefetch";
  if (isInjectedThirdPartyResource(r)) return "injected-resource";
  if (isInjectedInlineStyle(r)) return "injected-inline-style";

  return null;
}

/**
 * Decides whether a report that *is* worth logging should still stay off
 * Telegram.
 *
 * Crawlers accounted for 198 of the 209 notifications (95%) sent over the 49
 * days ending 2026-07-26: 169 SRI failures on content-hashed `_astro/page.*.js`
 * chunks from previous builds (Yandex re-rendering stale HTML snapshots) and 29
 * inline-script violations from Google's rendering netblocks (per-request nonce
 * vs. independently cached HTML). Neither is reproducible in a browser, and
 * both would also have to surface in `pnpm verify` / `security.spec.ts` to be
 * real, so they are noise — but they stay in `logs/csp-violations.log` so the
 * evidence survives if that assumption ever needs re-checking.
 *
 * @param {Record<string, unknown>} report - The raw report body.
 * @param {string} ua - The request User-Agent header.
 * @param {string} ip - The client IP forwarded by Nginx.
 * @returns {string|null} A short reason string when the notification should be
 *   suppressed, or null when it should be sent.
 */
export function getNotifySuppressReason(report, ua, ip) {
  const r = report["csp-report"] || report;
  if (!r || typeof r !== "object") return null;

  if (isBotUserAgent(ua)) return "crawler-ua";
  if (isCrawlerNetwork(ip)) return "crawler-network";

  return null;
}

/**
 * Rate-limit key for Telegram notifications: the violation signature, i.e.
 * *what* broke — the directive plus the blocked resource.
 *
 * Deliberately excludes both the client IP and the document URI. Keying on the
 * IP meant one crawler fleet rotating through 21 addresses produced 21 messages
 * for one identical violation (and a genuine site-wide regression would page
 * once per visitor); keying on the document URI meant a single browser session
 * hitting an injected `eval` on 12 pages produced 12 messages. The page a
 * violation happened on is preserved in `logs/csp-violations.log` and in the
 * first notification's body either way.
 *
 * @param {Record<string, unknown>} report - The raw report body (may or may not
 *   be wrapped in a "csp-report" key).
 * @returns {string} Stable signature for this kind of violation.
 */
export function getNotificationKey(report) {
  const r = report["csp-report"] || report;
  const directive =
    r["effective-directive"] || r["violated-directive"] || "unknown";
  const blocked = r["blocked-uri"] || "inline/eval";
  return `${directive}|${blocked}`;
}
