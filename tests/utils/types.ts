/**
 * Shared Type Definitions for Playwright Tests
 *
 * Centralized interfaces used across multiple test files:
 * - Axe-core types for accessibility testing
 * - Speculation rules types for prerender testing
 * - Sitemap parsing types
 * - Common page info structures
 */

// ============================================================================
// Axe-core Types (for accessibility testing)
// ============================================================================

/** Represents a single DOM node flagged by Axe-core. */
export interface AxeNode {
  html: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  target: any; // Axe-core uses complex selectors (UnlabelledFrameSelector)
  failureSummary?: string;
}

/** Represents an Axe-core rule result (violation, pass, incomplete). */
export interface AxeResult {
  id: string;
  impact?: string | null;
  tags: string[];
  description: string;
  help: string;
  helpUrl: string;
  nodes: AxeNode[];
}

/** Aggregated result with node count instead of full node details. */
export type AggregatedAxeResult = Omit<AxeResult, "nodes"> & { nodes: number };

/** Page scan result with violation details for accessibility tests. */
export interface PageAccessibilityResult {
  page: string;
  violations: number;
  incomplete: number;
  violationIds?: string[];
  reportPath: string;
  detailedViolations: AxeResult[];
  detailedIncomplete: AxeResult[];
  name?: string;
  url?: string;
}

// ============================================================================
// Speculation Rules Types (for prerender testing)
// ============================================================================

/** Interface representing a speculation rule script's properties. */
export interface SpeculationRuleInfo {
  content: SpeculationRule | null;
  nonce: string;
  hasNonce: boolean;
}

/** Interface for a single speculation rule entry. */
export interface SpeculationRuleItem {
  source: string;
  urls: string[];
  eagerness: string;
}

/** Interface for the speculation rule structure. */
export interface SpeculationRule {
  prerender?: SpeculationRuleItem[];
  prefetch?: SpeculationRuleItem[];
}

// ============================================================================
// Sitemap Types
// ============================================================================

/** URL entry from parsed sitemap XML. */
/** URL entry from parsed sitemap XML. */
export interface SitemapUrl {
  /**
   * Location URL.
   * Note: xml2js parses text nodes as arrays. Access [0] for the value.
   */
  loc: string[];
}

/** URL set container from parsed sitemap XML. */
export interface SitemapUrlSet {
  url: SitemapUrl[];
}

/** Root structure of parsed sitemap XML. */
export interface SitemapResult {
  urlset: SitemapUrlSet;
}

/** Sitemap index entry. */
export interface SitemapIndex {
  sitemap: { loc: string[] }[];
}

/** Root structure of parsed sitemap index XML. */
export interface SitemapIndexResult {
  sitemapindex: SitemapIndex;
}

/** Page info with name and URL for test iteration. */
export interface PageInfo {
  name: string;
  url: string;
}
