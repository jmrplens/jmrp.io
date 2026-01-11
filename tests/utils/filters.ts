/**
 * Error Filtering Utilities for Playwright Tests
 *
 * Functions to filter out known/expected errors from test results.
 */

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
  return (
    isCloudflareInsightsError(text) ||
    text.includes("Access-Control-Allow-Origin") ||
    text.includes("net::ERR_FAILED")
  );
}
