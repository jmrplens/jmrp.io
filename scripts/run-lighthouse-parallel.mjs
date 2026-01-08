/**
 * Parallel Lighthouse Runner
 *
 * Spawns multiple lhci collect processes in parallel to speed up local verification.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const resultsDir = path.join(rootDir, "lighthouse-results");

// 1. Get URLs (logic synced with lighthouserc.local.cjs)
const getUrls = () => {
  const sitemapPath = path.join(rootDir, "dist", "sitemap-0.xml");
  if (!fs.existsSync(sitemapPath)) {
    return ["https://jmrp.io/"];
  }
  const content = fs.readFileSync(sitemapPath, "utf8");
  const regex = /<loc>(.*?)<\/loc>/g;
  let urls = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    urls.push(match[1]);
  }
  return urls.filter((url) => {
    const pathname = new URL(url).pathname;
    // Keep core pages only
    if (pathname.startsWith("/blog/") && pathname !== "/blog/") return false;
    return true;
  });
};

const urls = getUrls();

console.log(
  `\n🚀 Starting parallel Lighthouse audit for ${urls.length} pages...\n`,
);

// Ensure clean results directory
if (fs.existsSync(resultsDir)) {
  fs.rmSync(resultsDir, { recursive: true, force: true });
}
fs.mkdirSync(resultsDir, { recursive: true });

// 2. Spawn processes
let hasFailures = false;

const runLighthouse = (url, index) => {
  return new Promise((resolve) => {
    const tempDir = path.join(rootDir, `.lighthouseci-temp-${index}`);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    // Arguments for lighthouse CLI
    const args = [
      "exec",
      "lighthouse",
      url,
      "--only-categories=performance,accessibility,best-practices,seo",
      "--chrome-flags=--no-sandbox --headless --ignore-certificate-errors",
      "--output=json",
      `--output-path=${path.join(resultsDir, `report-${index}.json`)}`,
      "--quiet",
    ];

    const child = spawn("pnpm", args, { stdio: "pipe" });
    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    child.stderr.on("data", (data) => {
      output += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`  ✅ Finished: ${url}`);
      } else {
        console.error(`  ❌ Failed (${code}): ${url}`);
        console.error(`     Full Output: ${output}`);
        hasFailures = true;
      }
      resolve();
    });
  });
};

// Run all in parallel
await Promise.all(urls.map((url, i) => runLighthouse(url, i)));

if (hasFailures) {
  console.error(`\n💥 Audit finished with errors.\n`);
  process.exit(1);
}

console.log(
  `\n✨ Parallel audit complete. Results stored in [lighthouse-results/]\n`,
);
