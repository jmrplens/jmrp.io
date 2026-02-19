/**
 * Playwright Test Utilities Index
 *
 * Central barrel export for all test utilities and shared types.
 * Provides a clean API for test scripts to import necessary helpers
 * from a single consolidated entry point.
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
export {
  filterPagesByLocale,
  getCachedPages,
  getPagesFromSitemap,
  getSitemapUrls,
} from "./sitemap";

// Accessibility utilities
export {
  aggregateAxeResults,
  generateAccessibilityIndexHtml,
} from "./accessibility";

// Error filters
export {
  blockCloudflare,
  isCloudflareInsightsError,
  shouldIgnoreError,
} from "./filters";
