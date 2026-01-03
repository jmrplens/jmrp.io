/**
 * Cloudflare Beacon Downloader
 *
 * This script downloads the Cloudflare Web Analytics beacon script during the build process.
 * By self-hosting this script, we can:
 * 1. Ensure it passes Subresource Integrity (SRI) checks (calculated by our build process).
 * 2. Allow it in our strict Content Security Policy (CSP).
 *
 * It saves the file to `public/scripts/cf-beacon.js`, which Astro then copies to `dist/`.
 */

import fs from "node:fs";
import path from "node:path";
import https from "node:https";

const BEACON_URL = "https://static.cloudflareinsights.com/beacon.min.js";
// Save to public/scripts so it is copied to dist/scripts during build
const OUTPUT_DIR = path.resolve("public/scripts");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "cf-beacon.js");

// Ensure directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log(`Downloading Cloudflare Beacon from ${BEACON_URL}...`);

https
  .get(BEACON_URL, (res) => {
    if (res.statusCode !== 200) {
      console.error(`Failed to download beacon: Status Code ${res.statusCode}`);
      process.exit(1);
    }

    const fileStream = fs.createWriteStream(OUTPUT_FILE);
    res.pipe(fileStream);

    fileStream.on("finish", () => {
      fileStream.close();
      console.log(`Beacon saved to ${OUTPUT_FILE}`);
    });
  })
  .on("error", (err) => {
    console.error(`Error downloading beacon: ${err.message}`);
    process.exit(1);
  });
