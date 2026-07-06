import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isBotUserAgent,
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

test("isBotUserAgent: word-boundary regex avoids false positives on words merely containing a bot keyword", () => {
  // "bot" is a substring of "robot"/"robotics" but never a standalone word in
  // these UAs — the word-boundary regex (\b(bot|crawl|spider|slurp)\b) must
  // not match, and none of these strings contain any SPECIFIC_BOT_UA_TOKENS
  // or trip the Chrome-less AppleWebKit/537.36 heuristic.
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
