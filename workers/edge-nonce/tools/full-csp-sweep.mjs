/**
 * Full-site CSP sweep through the edge: every sitemap URL in a real Chromium.
 * Per page: console CSP violations, page errors, the Worker's marker, and the
 * header nonce equal to the body nonce. Pages on a bypass route must NOT go
 * through the Worker, and /homelab/ must show real numbers. Exit 1 on any
 * failure.
 *
 * Run from the repository root after a build: node workers/edge-nonce/tools/full-csp-sweep.mjs
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

// Zone routes with no Worker that hold sitemap pages (see ../README.md). The
// contributions subpages under /projects/ are routed back into the Worker.
const BYPASS_PREFIXES = [
  "/homelab/",
  "/es/homelab/",
  "/projects/",
  "/es/projects/",
  "/tools/http-headers-analyzer/",
  "/es/tools/http-headers-analyzer/",
];
const BACK_IN_WORKER = [
  "/projects/contributions/",
  "/es/projects/contributions/",
];
const isBypassed = (path) =>
  BYPASS_PREFIXES.some((p) => path.startsWith(p)) &&
  BACK_IN_WORKER.every((p) => !path.startsWith(p));

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
let minted = 0;
let bypassed = 0;
let subHits = 0;

const CONCURRENCY = 4;
const queue = [...urls];

/** A page on a bypass route: no Worker marker, and homelab's tokens replaced. */
function checkBypassed(url, path, marker, html) {
  bypassed++;
  if (marker)
    failures.push([url, `bypass route went through the Worker (${marker})`]);
  if (path.includes("/homelab/") && html.includes("HLM_")) {
    failures.push([url, "HLM_ tokens not replaced"]);
  }
}

/** A page through the Worker: minted marker, one fresh nonce, header equals body. */
function checkMinted(url, headers, html) {
  minted++;
  if (headers["x-edge-sub-cache"] === "HIT") subHits++;
  const marker = headers["x-edge-nonce"] ?? "";
  if (marker !== "minted")
    failures.push([url, `marker='${marker}' (expected minted)`]);
  const csp = headers["content-security-policy"] ?? "";
  const headerNonce = /'nonce-([a-f0-9]{32})'/.exec(csp)?.[1];
  if (headerNonce) {
    if (nonces.has(headerNonce))
      failures.push([url, "NONCE REPEATED across pages"]);
    nonces.add(headerNonce);
    if (!html.includes(`nonce="${headerNonce}"`)) {
      failures.push([url, "header nonce != body nonce"]);
    }
  } else {
    failures.push([url, "CSP without a hex nonce"]);
  }
  if (html.includes("NGINX_CSP_NONCE"))
    failures.push([url, "placeholder not replaced"]);
}

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
    // RAW response body, not page.content(): browsers hide the nonce
    // attribute from the live DOM (CSP3 nonce-hiding), so a serialized DOM
    // never contains nonce="..." and the comparison would always fail.
    const html = await resp.text();
    if (violations.length > 0) failures.push([url, `CSP/JS: ${violations[0]}`]);
    const path = new URL(url).pathname;
    if (isBypassed(path)) {
      checkBypassed(url, path, headers["x-edge-nonce"] ?? "", html);
    } else {
      checkMinted(url, headers, html);
    }
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
  `worker (minted): ${minted} | bypass routes: ${bypassed} | sub-cache HIT: ${subHits}`,
);
console.log(`unique nonces: ${nonces.size} (expected ${minted})`);
console.log(`failures: ${failures.length}`);
for (const [u, why] of failures) console.log(`  ✘ ${u}: ${why}`);
process.exit(failures.length > 0 ? 1 : 0);
