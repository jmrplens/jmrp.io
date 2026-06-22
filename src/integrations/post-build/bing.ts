/**
 * Bing Webmaster URL Submission Utility
 *
 * Submits the site's URLs to the Bing Webmaster "SubmitUrlbatch" API using a
 * Webmaster API key. This is complementary to IndexNow (Bing also participates
 * in IndexNow); it uses the site's own Bing Webmaster quota and works once the
 * site is verified in Bing Webmaster Tools.
 *
 * Gated behind the secret `BING_WEBMASTER_API_KEY` env var — skipped entirely
 * when unset, so local/CI builds never call the API.
 */

import { type AstroIntegrationLogger } from "astro";

import { collectSitemapUrls } from "./indexnow.js";

const BING_ENDPOINT =
  "https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch";

/**
 * Submits the site's URLs to the Bing Webmaster URL Submission API.
 *
 * @param distDir - The build output directory containing the sitemaps.
 * @param logger - The Astro logger instance.
 */
export async function submitToBingWebmaster(
  distDir: string,
  logger: AstroIntegrationLogger,
) {
  const apiKey = process.env.BING_WEBMASTER_API_KEY;
  if (!apiKey) {
    logger.info(
      "Skipping Bing Webmaster submission (BING_WEBMASTER_API_KEY not set).",
    );
    return;
  }

  const siteUrl = (process.env.PUBLIC_SITE_URL || "https://jmrp.io").replace(
    /\/$/,
    "",
  );
  const urlList = collectSitemapUrls(distDir);
  if (urlList.length === 0) {
    logger.warn("Bing Webmaster: no sitemap URLs found, skipping submission.");
    return;
  }

  logger.info(`Submitting ${urlList.length} URLs to Bing Webmaster...`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    let response: Response;
    try {
      response = await fetch(
        `${BING_ENDPOINT}?apikey=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Accept: "application/json",
          },
          body: JSON.stringify({ siteUrl, urlList }),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.ok) {
      logger.info(`✓ Bing Webmaster accepted ${urlList.length} URLs.`);
    } else {
      logger.warn(
        `⚠ Bing Webmaster responded with ${response.status}: ${await response.text()}`,
      );
    }
  } catch (error) {
    // Non-fatal: a Bing submission failure must never break a deploy.
    logger.warn("⚠ Failed to submit to Bing Webmaster.");
    logger.warn(error instanceof Error ? error.message : String(error));
  }
}
