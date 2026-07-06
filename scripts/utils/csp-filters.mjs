/**
 * CSP Violation False-Positive Filters
 *
 * Shared predicates that decide whether a CSP violation report is a known
 * false positive (browser extension, antivirus injection, userscript, browser
 * translator, crawler, prefetch quirk, …) rather than a real, actionable issue
 * with the site itself.
 *
 * The site's own pages are verified to be CSP-clean on a real browser, so any
 * violation matching one of these predicates can be safely discarded before it
 * is logged or forwarded to Telegram. See docs/CSP_REPORTER.md.
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
 * Generic bot/crawler keywords, matched with a word-boundary regex (built
 * below) rather than `String.includes`, to avoid false positives on ordinary
 * words that merely contain them ("robot", "automotive", "spidering", …).
 */
const GENERIC_BOT_UA_KEYWORDS = ["bot", "crawl", "spider", "slurp"];

/** Word-boundary regex built from {@link GENERIC_BOT_UA_KEYWORDS}. */
const GENERIC_BOT_UA_REGEX = new RegExp(
  String.raw`\b(${GENERIC_BOT_UA_KEYWORDS.join("|")})\b`,
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
 * Runs the full false-positive filter chain for a received report.
 *
 * @param {Record<string, unknown>} report - The raw report body (may or may not
 *   be wrapped in a "csp-report" key).
 * @param {string} ua - The request User-Agent header.
 * @returns {string|null} A short reason string when the report should be
 *   discarded, or null when it should be logged/notified.
 */
export function getDiscardReason(report, ua) {
  const r = report["csp-report"] || report;
  if (!r || typeof r !== "object") return "empty";

  if (isExtensionViolation(r)) return "extension";
  if (isBrowserInternalViolation(r)) return "browser-internal";
  if (isPrefetchFalsePositive(r)) return "prefetch";
  if (isBotUserAgent(ua)) return "bot";
  if (isInjectedThirdPartyResource(r)) return "injected-resource";
  if (isInjectedInlineStyle(r)) return "injected-inline-style";

  return null;
}
