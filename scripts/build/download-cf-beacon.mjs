/**
 * Cloudflare Beacon Downloader
 *
 * This script downloads the Cloudflare Web Analytics beacon script during the build process.
 * By self-hosting this script, we can:
 * 1. Ensure it passes Subresource Integrity (SRI) checks (calculated by our build process).
 * 2. Allow it in our strict Content Security Policy (CSP).
 *
 * It saves the file to `public/scripts/cf-beacon.js`, which Astro then copies to `dist/`.
 *
 * The script only runs if PUBLIC_CF_BEACON_TOKEN is defined in .env.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Manual .env parser to avoid extra dependencies in prebuild scripts.
 */
function getEnvToken() {
  try {
    if (process.env.PUBLIC_CF_BEACON_TOKEN)
      return process.env.PUBLIC_CF_BEACON_TOKEN;

    const envPath = path.resolve(".env");
    if (!fs.existsSync(envPath)) return null;

    const envContent = fs.readFileSync(envPath, "utf-8");
    const match = envContent.match(/^PUBLIC_CF_BEACON_TOKEN=(.*)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

const token = getEnvToken();

if (!token) {
  console.log(
    "[PreBuild] PUBLIC_CF_BEACON_TOKEN not found. Skipping Cloudflare Beacon download.",
  );
  process.exit(0);
}

const BEACON_URL = "https://static.cloudflareinsights.com/beacon.min.js";
const OUTPUT_DIR = path.resolve("public/scripts");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "cf-beacon.js");

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log(`[PreBuild] Downloading Cloudflare Beacon from ${BEACON_URL}...`);

try {
  const res = await fetch(BEACON_URL);

  if (!res.ok) {
    console.error(`  ✗ Failed to download beacon: Status Code ${res.status}`);
    process.exit(1);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(OUTPUT_FILE, buffer);

  console.log(`  ✓ Beacon saved to ${OUTPUT_FILE}`);
} catch (err) {
  const errorMessage = err instanceof Error ? err.message : String(err);
  console.error(`  ✗ Error downloading beacon: ${errorMessage}`);
  process.exit(1);
}
