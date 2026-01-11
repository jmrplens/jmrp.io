/**
 * Test Utilities
 *
 * Central export for all Playwright test utilities.
 * Import from this file for convenient access to all utilities.
 */

// Types
export type {
  AggregatedAxeResult,
  AxeNode,
  AxeResult,
  PageAccessibilityResult,
  PageInfo,
  SitemapIndex,
  SitemapIndexResult,
  SitemapResult,
  SitemapUrl,
  SitemapUrlSet,
  SpeculationRule,
  SpeculationRuleInfo,
} from "./types";

// Sitemap utilities
export { getPagesFromSitemap, getSitemapUrls } from "./sitemap";

// Accessibility utilities
export {
  aggregateAxeResults,
  generateAccessibilityIndexHtml,
} from "./accessibility";

// Error filters
export { isCloudflareInsightsError, shouldIgnoreError } from "./filters";
