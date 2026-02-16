/**
 * Playwright Global Setup
 *
 * Runs once before all test workers. Pre-generates a cached pages list
 * from the sitemap so per-page tests (accessibility, functional, security,
 * SEO) can register one test per page at module scope (synchronously)
 * for parallel execution across workers.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { getPagesFromSitemap } from "./utils/sitemap";

const REPORT_DIR = "accessibility-report";
const RESULTS_DIR = path.join(REPORT_DIR, ".results");
const PAGES_CACHE = path.join(REPORT_DIR, ".pages-cache.json");

/**
 * Pre-generates a cached pages list from the sitemap for parallel test registration.
 */
export default async function globalSetup(): Promise<void> {
  // Ensure report directories exist
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  // Clean results from previous runs
  fs.rmSync(RESULTS_DIR, { recursive: true, force: true });
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  // Generate pages cache for per-page test registration
  const pages = await getPagesFromSitemap();
  fs.writeFileSync(PAGES_CACHE, JSON.stringify(pages));
  console.log(`📄 Cached ${pages.length} pages for per-page test suites`);
}
