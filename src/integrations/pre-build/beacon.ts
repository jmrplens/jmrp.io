import fs from "node:fs";
import path from "node:path";

import { type AstroIntegrationLogger } from "astro";

const BEACON_URL = "https://static.cloudflareinsights.com/beacon.min.js";
const OUTPUT_DIR = path.resolve("public/scripts");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "cf-beacon.js");

/**
 * Downloads the Cloudflare Web Analytics beacon script.
 * Only runs if a token is provided.
 *
 * @param token - Cloudflare beacon token.
 * @param logger - Astro logger instance.
 */
export async function setupCfBeacon(
  token: string | undefined,
  logger: AstroIntegrationLogger,
) {
  if (!token) {
    logger.info("No Cloudflare token found. Skipping beacon download.");
    return;
  }

  logger.info("Downloading Cloudflare Beacon...");

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  try {
    const res = await fetch(BEACON_URL, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`Status ${res.status}`);

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(OUTPUT_FILE, buffer);
    logger.info(`  ✓ Beacon saved to ${OUTPUT_FILE}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error downloading beacon: ${message}`);
    // We don't throw here to avoid breaking the build if the beacon is just an extra
  }
}
