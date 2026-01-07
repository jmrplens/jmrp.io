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

const BEACON_URL = "https://static.cloudflareinsights.com/beacon.min.js";
// Save to public/scripts so it is copied to dist/scripts during build
const OUTPUT_DIR = path.resolve("public/scripts");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "cf-beacon.js");

// Ensure directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log(`Downloading Cloudflare Beacon from ${BEACON_URL}...`);

try {
  const res = await fetch(BEACON_URL);

  if (!res.ok) {
    console.error(`Failed to download beacon: Status Code ${res.status}`);
    process.exit(1);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(OUTPUT_FILE, buffer);

  console.log(`Beacon saved to ${OUTPUT_FILE}`);
} catch (err) {
  console.error(`Error downloading beacon: ${err.message}`);
  process.exit(1);
}
