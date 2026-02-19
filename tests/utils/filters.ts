/**
 * Error Filtering Utilities for Playwright Tests
 *
 * Provides functions to distinguish between real application errors and
 * expected/benign network errors (e.g., CORS errors from Cloudflare Insights
 * on localhost) to prevent false negative test results.
 */

import type { Page } from "@playwright/test";

/**
 * Blocks the Cloudflare beacon script and RUM routes to prevent analytics errors in tests.
 *
 * @param page - Playwright page instance
 */
export async function blockCloudflare(page: Page): Promise<void> {
  await page.route("**/beacon.min.js", (route) => route.abort());
  await page.route("**/cdn-cgi/rum*", (route) => route.abort());
}

/**
 * Checks if a URL appears to be local or from an excluded domain.
 * Used to identify errors that are expected in localhost test environments.
 *
 * @param text - The text to check for localhost/local IP indicators
 * @returns true if the text indicates a local or excluded domain
 */
function isLocalOrExcludedDomain(text: string): boolean {
  return (
    text.includes("localhost") ||
    text.includes("127.0.0.1") ||
    /\bjmrp\.io\b/.test(text)
  );
}

/**
 * Checks if a console error message is from Cloudflare Insights.
 * These are expected CORS errors in localhost test environments.
 *
 * @param text - The console message text
 * @returns true if the error is from Cloudflare Insights
 */
export function isCloudflareInsightsError(text: string): boolean {
  // Extract potential URLs from the console message and check their hostnames.
  const urlPattern = /\bhttps?:\/\/[^\s"']+/g;
  const matches = text.match(urlPattern);
  if (!matches) {
    return false;
  }
  for (const candidate of matches) {
    try {
      const url = new URL(candidate);
      const host = url.hostname.toLowerCase();
      if (
        host === "cloudflareinsights.com" ||
        host.endsWith(".cloudflareinsights.com")
      ) {
        return true;
      }
    } catch {
      // Ignore parse errors and continue checking other candidates.
    }
  }
  return false;
}

/**
 * Checks if an error should be ignored in functional tests.
 * Filters out expected network/CORS errors that don't indicate real issues.
 *
 * @param text - The error message text
 * @returns true if the error should be ignored
 */
export function shouldIgnoreError(text: string): boolean {
  // CORS errors are only ignored if they mention expected domains/contexts
  const isExpectedCorsError =
    text.includes("Access-Control-Allow-Origin") &&
    (text.includes("127.0.0.1") ||
      text.includes("localhost") ||
      text.includes("cloudflare") ||
      text.includes("cloudflareinsights"));

  const isResource404 =
    text.includes("status of 404") &&
    (text.includes("/_astro/favicon") ||
      ((text.includes("/assets/") || text.includes("/pdf/")) &&
        text.includes(".pdf")) ||
      text.includes("/assets/icons/") ||
      text.includes("/api/proxy/"));

  // Ignore 404 for external resources (e.g., author profile pages at universities)
  // These are not app bugs - the external sites may be temporarily unavailable
  // Note: Browser often shows generic message without URL for external resource failures
  const isExternalResource404 =
    text.includes("status of 404") &&
    (text.includes("http://") || text.includes("https://")) &&
    !isLocalOrExcludedDomain(text);

  // Generic "Failed to load resource" errors with 404 status
  // Suppress ALL 404 resource failures because:
  // 1. External resources can fail randomly and are not our responsibility
  // 2. Internal resources are validated by lychee, sitemap, and html-validate
  // 3. Browser often omits the URL in these messages, making it impossible to distinguish
  const isGeneric404 =
    text.includes("Failed to load resource") && text.includes("status of 404");

  return (
    isCloudflareInsightsError(text) ||
    isExpectedCorsError ||
    isResource404 ||
    isExternalResource404 ||
    // Suppress generic 404s - external resources can fail randomly
    // and internal resources are validated by lychee/html-validate
    isGeneric404 ||
    // Only ignore generic failures if likely related to localhost/CORS
    (text.includes("net::ERR_FAILED") &&
      (text.includes("127.0.0.1") || text.includes("localhost")))
  );
}
