/**
 * Playwright Global Teardown
 *
 * Runs once after all test workers finish. Aggregates per-page accessibility
 * result files (written by parallel workers) into summary JSON and an HTML
 * index report. Cleans up temporary files.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import {
  aggregateAxeResults,
  generateAccessibilityIndexHtml,
} from "./utils/accessibility";
import type { PageAccessibilityResult } from "./utils/types";

const REPORT_DIR = "accessibility-report";
const RESULTS_DIR = path.join(REPORT_DIR, ".results");
const PAGES_CACHE = path.join(REPORT_DIR, ".pages-cache.json");

/**
 * Aggregates per-page accessibility result files into summary JSON and HTML index.
 */
export default function globalTeardown(): void {
  if (!fs.existsSync(RESULTS_DIR)) return;

  const resultFiles = fs
    .readdirSync(RESULTS_DIR)
    .filter((f) => f.endsWith(".json"));

  if (resultFiles.length === 0) return;

  // Process each theme separately
  for (const theme of ["light", "dark"] as const) {
    const themeFiles = resultFiles.filter((f) => f.endsWith(`-${theme}.json`));
    if (themeFiles.length === 0) continue;

    const results: PageAccessibilityResult[] = themeFiles.map(
      (f) =>
        JSON.parse(
          fs.readFileSync(path.join(RESULTS_DIR, f), "utf-8"),
        ) as PageAccessibilityResult,
    );

    const uniqueViolations = aggregateAxeResults(results, "detailedViolations");
    const uniqueIncomplete = aggregateAxeResults(results, "detailedIncomplete");

    const summary = {
      theme,
      totalPages: results.length,
      passed: results.filter((r) => r.violations === 0).length,
      failed: results.filter((r) => r.violations > 0).length,
      incomplete: results.filter((r) => r.incomplete > 0).length,
      violations: [...uniqueViolations.values()],
      incompleteList: [...uniqueIncomplete.values()],
      pages: results.map(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ({ detailedViolations, detailedIncomplete, ...rest }) => rest,
      ),
    };

    const summaryPath = `${REPORT_DIR}/accessibility-summary-${theme}.json`;
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(
      `✅ Accessibility summary (${theme}) written to: ${summaryPath}`,
    );

    const indexHtml = generateAccessibilityIndexHtml(theme, summary, results);
    fs.writeFileSync(`${REPORT_DIR}/index.html`, indexHtml);
    console.log(
      "✅ Accessibility index written to: accessibility-report/index.html",
    );
  }

  // Cleanup temporary files
  fs.rmSync(RESULTS_DIR, { recursive: true, force: true });
  fs.rmSync(PAGES_CACHE, { force: true });
}
