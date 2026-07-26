import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getDiscardReason,
  getNotificationKey,
  getNotifySuppressReason,
  isBotUserAgent,
  isCrawlerNetwork,
  isExtensionViolation,
  isInjectedThirdPartyResource,
} from "./csp-filters.mjs";

test("isBotUserAgent: AI crawlers/assistants", () => {
  const aiCrawlerUserAgents = [
    "Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.1; +https://openai.com/gptbot)",
    "Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
    "Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)",
    "Mozilla/5.0 AppleWebKit/537.36 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    "Mozilla/5.0 (compatible; Claude-Web/1.0; +https://www.anthropic.com)",
    "Mozilla/5.0 (compatible; anthropic-ai)",
    "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/bot)",
    "Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/amazonbot)",
    "Mozilla/5.0 (compatible; Applebot/0.1; +http://www.apple.com/go/applebot)",
    "Mozilla/5.0 AppleWebKit/537.36 (compatible; Bytespider; +http://www.bytedance.com)",
  ];
  for (const ua of aiCrawlerUserAgents) {
    assert.equal(isBotUserAgent(ua), true, `expected bot UA: ${ua}`);
  }
});

test("isBotUserAgent: SEO/indexing crawlers", () => {
  const seoCrawlerUserAgents = [
    "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
    "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)",
    "Mozilla/5.0 (compatible; DataForSeoBot/1.0; +https://dataforseo.com/dataforseo-bot)",
    "Mozilla/5.0 (compatible; Google-InspectionTool/1.0)",
    "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
  ];
  for (const ua of seoCrawlerUserAgents) {
    assert.equal(isBotUserAgent(ua), true, `expected bot UA: ${ua}`);
  }
});

test("isBotUserAgent: ordinary browser UAs are not flagged (no false positives)", () => {
  const realBrowserUserAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  ];
  for (const ua of realBrowserUserAgents) {
    assert.equal(isBotUserAgent(ua), false, `expected real browser UA: ${ua}`);
  }
});

test("isBotUserAgent: suffix regex avoids false positives on words merely containing a bot keyword", () => {
  // "bot" is a substring of "robot"/"robotics", but there the keyword is
  // followed by more letters, so the suffix regex ((bot|crawl|…)(?![a-z]))
  // must not match. None of these strings contains a SPECIFIC_BOT_UA_TOKENS
  // entry or trips the Chrome-less AppleWebKit/537.36 heuristic either.
  const nonBotUserAgents = [
    // "robot" — vacuum/appliance UA that happens to mention the device kind.
    "Mozilla/5.0 (compatible; RobotVacuum/3.2; +https://example.com/robotvacuum)",
    // "automotive" — real in-car infotainment browser UA (Chrome/ present).
    "Mozilla/5.0 (Linux; automotive; InfotainmentOS 4.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    // "Robotics" — capitalized, embeds "bot" with no boundary before it.
    "Mozilla/5.0 (compatible; RoboticsControlPanel/2.1; +https://example.com/robotics)",
  ];
  for (const ua of nonBotUserAgents) {
    assert.equal(
      isBotUserAgent(ua),
      false,
      `expected non-bot UA (word-boundary false positive): ${ua}`,
    );
  }
});

test("isBotUserAgent: crawler names that end in a keyword (the regression)", () => {
  // Every one of these was classified as *real traffic* by the previous
  // `\b(bot|crawl|spider|slurp)\b` regex: the keyword ends the name, so it is
  // preceded by a letter and a leading word boundary can never match. Yandex
  // alone accounted for 167 of the 490 surviving reports in production.
  const crawlerUserAgents = [
    "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0",
    "Mozilla/5.0 (compatible; YandexRenderResourcesBot/1.0; +http://yandex.com/bots) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0",
    // Yandex also renders with a spoofed iPhone prefix and only the suffix gives it away.
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1 (compatible; YandexRenderResourcesBot/1.0; +http://yandex.com/bots)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/143.0.0.0 Safari/537.36",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.0.0 Safari/537.36",
    "AdsBot-Google (+http://www.google.com/adsbot.html)",
    "YisouSpider",
  ];
  for (const ua of crawlerUserAgents) {
    assert.equal(isBotUserAgent(ua), true, `expected crawler UA: ${ua}`);
  }
});

test("isCrawlerNetwork: Google/Yandex crawler ranges vs everything else", () => {
  // Addresses observed in production sending browser-masqueraded reports.
  const crawlerIps = [
    "66.249.88.3", // Googlebot 66.249.64.0/19
    "64.233.172.103", // Google 64.233.160.0/19
    "74.125.209.38", // Google 74.125.0.0/16
    "74.125.210.8",
    "95.108.213.234", // Yandex 95.108.128.0/17
    "213.180.203.4", // Yandex 213.180.192.0/19
    "2a02:6b8:c42:26a3:0:492c:3c00:0", // Yandex 2a02:6b8::/29
  ];
  for (const ip of crawlerIps) {
    assert.equal(isCrawlerNetwork(ip), true, `expected crawler network: ${ip}`);
  }

  const userIps = [
    "83.49.10.109", // Spanish residential ISP (real visitor)
    "79.116.156.140",
    "167.71.96.241", // DigitalOcean — a scanner, but NOT a crawler we trust
    "34.72.10.1", // Google *Cloud* customer VM — deliberately excluded
    "35.184.0.1",
    "2806:103e:19:a0d7:e808:225f:d15b:d429", // Mexican residential IPv6
    "not-an-ip",
    "",
  ];
  for (const ip of userIps) {
    assert.equal(isCrawlerNetwork(ip), false, `expected non-crawler: ${ip}`);
  }
});

test("getNotifySuppressReason: crawlers are suppressed, real clients are not", () => {
  const report = {
    "csp-report": {
      "violated-directive": "script-src-elem",
      "effective-directive": "script-src-elem",
      "blocked-uri": "inline",
      "document-uri": "https://jmrp.io/tools/modbus-frame-builder/",
    },
  };
  const browser =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

  assert.equal(
    getNotifySuppressReason(
      report,
      "Mozilla/5.0 (compatible; YandexBot/3.0)",
      "1.2.3.4",
    ),
    "crawler-ua",
  );
  // Google's renderer masquerades as a browser; only the netblock gives it away.
  assert.equal(
    getNotifySuppressReason(report, browser, "66.249.88.3"),
    "crawler-network",
  );
  // A real visitor's inline-script violation must always be notified.
  assert.equal(getNotifySuppressReason(report, browser, "83.49.10.109"), null);
});

test("getDiscardReason: crawler reports are kept in the log", () => {
  // Crawler classification lives in the notification tier now, so a crawler
  // report must still be written to logs/csp-violations.log.
  const report = {
    "csp-report": {
      "violated-directive": "sri-integrity",
      "effective-directive": "sri",
      "blocked-uri": "https://jmrp.io/_astro/page.CVHypVBz.js",
      "document-uri": "https://jmrp.io/",
      "script-sample": "SRI check failed",
    },
  };
  assert.equal(getDiscardReason(report), null);
});

test("getNotificationKey: ignores client IP and document URI", () => {
  const build = (documentUri) => ({
    "csp-report": {
      "effective-directive": "sri",
      "blocked-uri": "https://jmrp.io/_astro/page.CVHypVBz.js",
      "document-uri": documentUri,
    },
  });
  assert.equal(
    getNotificationKey(build("https://jmrp.io/")),
    getNotificationKey(build("https://jmrp.io/blog/009-running-tor-bridge/")),
  );
  assert.equal(
    getNotificationKey({
      "csp-report": { "violated-directive": "script-src" },
    }),
    "script-src|inline/eval",
  );
});

test("isExtensionViolation: AV_EXTENSION_HOSTS (antivirus/security-suite hosts)", () => {
  const avHosts = [
    "kaspersky-labs.com",
    "avast.com",
    "avcdn.net",
    "avg.com",
    "eset.com",
    "mcafee.com",
    "malwarebytes.com",
    "bitdefender.net",
    "bitdefender.com",
  ];
  for (const host of avHosts) {
    const report = { "source-file": `https://sub.${host}/injected.js` };
    assert.equal(
      isExtensionViolation(report),
      true,
      `expected AV extension host to be detected: ${host}`,
    );
  }
});

test("isInjectedThirdPartyResource: translator hosts", () => {
  const translatorHosts = [
    "translate.google.com",
    "translator.microsoft.com",
    "edge.microsoft.com",
    "deepl.com",
  ];
  for (const host of translatorHosts) {
    const report = { "blocked-uri": `https://${host}/some-asset.js` };
    assert.equal(
      isInjectedThirdPartyResource(report),
      true,
      `expected translator host to be detected: ${host}`,
    );
  }
});
