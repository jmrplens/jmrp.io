/**
 * IndexNow Submission Utility
 *
 * Pushes the site's URLs to the IndexNow API (Bing, Yandex, Seznam, Naver…) so
 * new and updated pages are picked up immediately instead of waiting for a
 * crawl. This is the strongest single lever for Bing Copilot freshness.
 *
 * The verification key is served as a static file at `/<key>.txt` (see
 * `public/<key>.txt`) and MUST match {@link INDEXNOW_KEY}.
 *
 * Gated behind the `POSTBUILD_INDEXNOW` env var so local/CI builds never ping
 * the API — set it (e.g. `POSTBUILD_INDEXNOW=1`) only on the production server.
 */

import fs from "node:fs";
import path from "node:path";

import { type AstroIntegrationLogger } from "astro";

/** IndexNow verification key — must match the filename of `public/<key>.txt`. */
export const INDEXNOW_KEY = "e0f36bbff68da9f8d629749b848ed7c8";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS = 10_000; // IndexNow per-request limit.

/** Extracts `<loc>` URLs from a sitemap XML string. */
function extractLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

/**
 * Collects all page URLs from the generated sitemaps in the dist directory.
 * Resolves the sitemap index to its child sitemaps, then de-duplicates.
 */
export function collectSitemapUrls(distDir: string): string[] {
  const urls = new Set<string>();
  const indexPath = path.join(distDir, "sitemap-index.xml");
  if (!fs.existsSync(indexPath)) return [];

  const childSitemaps = extractLocs(fs.readFileSync(indexPath, "utf8"));
  for (const sitemapUrl of childSitemaps) {
    const fileName = path.basename(new URL(sitemapUrl).pathname);
    const childPath = path.join(distDir, fileName);
    if (!fs.existsSync(childPath)) continue;
    for (const loc of extractLocs(fs.readFileSync(childPath, "utf8"))) {
      urls.add(loc);
    }
  }
  return [...urls];
}

/**
 * Submits the site's URLs to IndexNow.
 *
 * @param distDir - The build output directory containing the sitemaps.
 * @param logger - The Astro logger instance.
 */
export async function submitToIndexNow(
  distDir: string,
  logger: AstroIntegrationLogger,
) {
  if (!process.env.POSTBUILD_INDEXNOW) {
    logger.info("Skipping IndexNow submission (POSTBUILD_INDEXNOW not set).");
    return;
  }

  const siteUrl = (process.env.PUBLIC_SITE_URL || "https://jmrp.io").replace(
    /\/$/,
    "",
  );
  const host = new URL(siteUrl).host;
  const keyLocation = `${siteUrl}/${INDEXNOW_KEY}.txt`;

  const urlList = collectSitemapUrls(distDir).slice(0, MAX_URLS);
  if (urlList.length === 0) {
    logger.warn("IndexNow: no sitemap URLs found, skipping submission.");
    return;
  }

  logger.info(`Submitting ${urlList.length} URLs to IndexNow (${host})...`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    let response: Response;
    try {
      response = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation, urlList }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // IndexNow returns 200 (accepted) or 202 (accepted, pending validation).
    if (response.ok || response.status === 202) {
      logger.info(`✓ IndexNow accepted ${urlList.length} URLs.`);
    } else {
      logger.warn(
        `⚠ IndexNow responded with ${response.status}: ${await response.text()}`,
      );
    }
  } catch (error) {
    // Non-fatal: IndexNow failure must never break a deploy.
    logger.warn("⚠ Failed to submit to IndexNow.");
    logger.warn(error instanceof Error ? error.message : String(error));
  }
}
