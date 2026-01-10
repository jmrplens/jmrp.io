/**
 * Cloudflare Cache Purge Utility
 *
 * Handles clearing the Cloudflare cache after a successful build/deployment.
 * Supports Global API Key (requires email) or API Token.
 */

import { type AstroIntegrationLogger } from "astro";

/**
 * Purges the entire cache for the configured Cloudflare zone.
 *
 * @param logger - The Astro logger instance.
 * @returns Resolves when the operation is complete (success or skipped).
 */
export async function purgeCloudflareCache(logger: AstroIntegrationLogger) {
  const token = process.env.PRIVATE_CF_API_TOKEN;
  const email = process.env.PRIVATE_CF_EMAIL;
  const zoneId = process.env.PRIVATE_CF_ZONE_ID;

  if (!token || !zoneId) {
    logger.info(
      "Skipping Cloudflare cache purge (PRIVATE_CF_API_TOKEN or PRIVATE_CF_ZONE_ID not set).",
    );
    return;
  }

  const isGlobalKey = !!email;
  logger.info(
    `Purging Cloudflare cache (Purge Everything) using ${isGlobalKey ? "Global API Key" : "API Token"}...`,
  );

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (isGlobalKey) {
      headers["X-Auth-Email"] = email;
      headers["X-Auth-Key"] = token;
    } else {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // Use AbortController for timeout to prevent infinite hang
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000); // 15 seconds

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
      {
        method: "POST",
        headers,
        // Using purge_everything for consistency in personal portfolio updates.
        // For larger sites, consider selective purging by URL or Cache-Tag.
        body: JSON.stringify({ purge_everything: true }),
        signal: controller.signal,
      },
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Cloudflare API responded with ${response.status}: ${errorText}`,
      );
    }

    const data = (await response.json()) as {
      success: boolean;
      errors: unknown[];
    };

    if (!data.success) {
      throw new Error(
        `Cloudflare reported failure: ${JSON.stringify(data.errors)}`,
      );
    }

    logger.info("✓ Cloudflare cache purged successfully.");
  } catch (error) {
    logger.error("⚠ Failed to purge Cloudflare cache.");
    logger.error(error instanceof Error ? error.message : String(error));
  }
}
