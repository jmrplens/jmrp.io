import fs from "node:fs";
import path from "node:path";

const BEACON_URL = "https://static.cloudflareinsights.com/beacon.min.js";
const OUTPUT_DIR = path.resolve("public/scripts");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "cf-beacon.js");

/**
 * Downloads the Cloudflare Web Analytics beacon script.
 * Only runs if a token is provided.
 */
export async function setupCfBeacon(token: string | undefined) {
  if (!token) {
    console.log(
      "[PreBuild] No Cloudflare token found. Skipping beacon download.",
    );
    return;
  }

  console.log(`[PreBuild] Downloading Cloudflare Beacon...`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  try {
    const res = await fetch(BEACON_URL, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`Status ${res.status}`);

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(OUTPUT_FILE, buffer);
    console.log(`  ✓ Beacon saved to ${OUTPUT_FILE}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ Error downloading beacon: ${message}`);
    // We don't throw here to avoid breaking the build if the beacon is just an extra
  }
}
