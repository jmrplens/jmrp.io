/**
 * Full-site CSP sweep through the edge: every sitemap URL in a real Chromium.
 * Per page: console CSP violations, page errors, worker marker, nonce
 * header==body match. Homelab pages must BYPASS the worker and show real
 * numbers. Exit 1 on any failure.
 */
import { Resolver } from "node:dns/promises";
import { readFileSync } from "node:fs";

import { chromium } from "playwright";

const xml = readFileSync(
  new URL("../../../dist/sitemap-0.xml", import.meta.url),
  "utf8",
);
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
console.log(`pages: ${urls.length}`);

// This server resolves jmrp.io to itself; ask a public resolver for the
// Cloudflare address so the sweep goes through the edge.
const resolver = new Resolver();
// Cloudflare's public resolver, the same answer any visitor gets.
// eslint-disable-next-line sonarjs/no-hardcoded-ip -- a public DNS resolver, not configuration
resolver.setServers(["1.1.1.1"]);
const [edgeIp] = await resolver.resolve4("jmrp.io");
const browser = await chromium.launch({
  args: [`--host-resolver-rules=MAP jmrp.io ${edgeIp}`],
});

const failures = [];
const nonces = new Set();
let minted = 0,
  bypassed = 0,
  subHits = 0;

const CONCURRENCY = 4;
const queue = [...urls];

async function checkPage(context, url) {
  const page = await context.newPage();
  const violations = [];
  page.on("console", (m) => {
    const t = m.text();
    if (t.includes("Content Security Policy") || t.startsWith("Refused to")) {
      violations.push(t.slice(0, 160));
    }
  });
  page.on("pageerror", (error) => {
    violations.push(`pageerror: ${String(error).slice(0, 120)}`);
  });

  try {
    const resp = await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    const headers = resp.headers();
    const marker = headers["x-edge-nonce"] ?? "";
    const csp = headers["content-security-policy"] ?? "";
    const headerNonce = /'nonce-([a-f0-9]{32})'/.exec(csp)?.[1];
    // RAW response body, not page.content(): browsers hide the nonce
    // attribute from the live DOM (CSP3 nonce-hiding), so a serialized DOM
    // never contains nonce="..." and the comparison would always fail.
    const html = await resp.text();
    const isHomelab = /\/homelab\/$/.test(url);

    if (violations.length > 0) failures.push([url, `CSP/JS: ${violations[0]}`]);

    if (isHomelab) {
      if (marker)
        failures.push([url, `homelab went through the worker (${marker})`]);
      if (html.includes("HLM_"))
        failures.push([url, "HLM_ tokens not replaced"]);
    } else {
      if (marker !== "minted")
        failures.push([url, `marker='${marker}' (expected minted)`]);
      if (headerNonce) {
        if (nonces.has(headerNonce))
          failures.push([url, "NONCE REPEATED across pages"]);
        nonces.add(headerNonce);
        if (!html.includes(`nonce="${headerNonce}"`))
          failures.push([url, "header nonce != body nonce"]);
      } else {
        failures.push([url, "CSP without a hex nonce"]);
      }
      if (html.includes("NGINX_CSP_NONCE"))
        failures.push([url, "placeholder not replaced"]);
      minted++;
      if (headers["x-edge-sub-cache"] === "HIT") subHits++;
    }
    if (isHomelab) bypassed++;
  } catch (error) {
    failures.push([url, `error: ${String(error).slice(0, 100)}`]);
  } finally {
    await page.close();
  }
}

const context = await browser.newContext();
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) await checkPage(context, queue.shift());
  }),
);
await browser.close();

console.log(
  `worker(minted): ${minted} | homelab bypass: ${bypassed} | sub-cache HIT: ${subHits}`,
);
console.log(`unique nonces: ${nonces.size} (expected ${minted})`);
console.log(`failures: ${failures.length}`);
for (const [u, why] of failures) console.log(`  ✘ ${u}: ${why}`);
process.exit(failures.length > 0 ? 1 : 0);
