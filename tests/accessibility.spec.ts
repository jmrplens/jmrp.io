/**
 * Accessibility Test Suite (Main Axe-core Scan)
 *
 * This test suite performs automated accessibility scanning using Axe-core.
 * It iterates through all pages discovered in the site's sitemap and verifies
 * compliance with WCAG 2.1 Level AA standards.
 *
 * The suite executes twice:
 * 1. Using a light theme (via browser local storage)
 * 2. Using a dark theme
 *
 * Detailed HTML reports and a summary JSON are generated in the
 * `accessibility-report/` directory after execution.
 */

import * as fs from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createHtmlReport } from "axe-html-reporter";

import {
  aggregateAxeResults,
  type AxeResult,
  generateAccessibilityIndexHtml,
  getPagesFromSitemap,
  type PageAccessibilityResult,
  type PageInfo,
} from "./utils";

test.describe("Accessibility Tests (Axe-core WCAG 2.1 AA)", () => {
  let pages: PageInfo[];
  const theme = process.env.THEME === "dark" ? "dark" : "light";
  const results: PageAccessibilityResult[] = [];

  // Load pages once before all tests
  test.beforeAll(async () => {
    pages = await getPagesFromSitemap();

    // Ensure report directory exists
    if (!fs.existsSync("accessibility-report")) {
      fs.mkdirSync("accessibility-report", { recursive: true });
    }
  });

  test.afterAll(() => {
    // Aggregate violations using helper functions
    const uniqueViolations = aggregateAxeResults(results, "detailedViolations");
    const uniqueIncomplete = aggregateAxeResults(results, "detailedIncomplete");

    // Generate summary
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

    // Write summary JSON
    const summaryPath = `accessibility-report/accessibility-summary-${theme}.json`;
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`✅ Accessibility summary written to: ${summaryPath}`);

    // Write index HTML using helper function
    const indexHtml = generateAccessibilityIndexHtml(theme, summary, results);
    fs.writeFileSync("accessibility-report/index.html", indexHtml);
    console.log(
      "✅ Accessibility index written to: accessibility-report/index.html",
    );
  });

  // Dynamically generate tests for all discovered pages
  test(`Accessibility Scan (${theme} mode)`, async ({ page: browserPage }) => {
    // Force color scheme based on env var
    await browserPage.emulateMedia({
      colorScheme: theme === "dark" ? "dark" : "light",
    });

    for (const pageInfo of pages) {
      await test.step(`Scan ${pageInfo.name} (${pageInfo.url})`, async () => {
        await browserPage.goto(pageInfo.url);
        // eslint-disable-next-line playwright/no-networkidle
        await browserPage.waitForLoadState("networkidle");

        // Verify theme application
        await browserPage.evaluate((t) => {
          document.documentElement.dataset.theme = t;
          document.documentElement.classList.toggle("dark", t === "dark");
        }, theme);

        await browserPage.evaluate(() => document.fonts.ready);

        const accessibilityScanResults = await new AxeBuilder({
          page: browserPage,
        })
          .exclude(["svg"])
          .withTags([
            "wcag2a",
            "wcag2aa",
            "wcag21aa",
            "wcag22aa",
            "best-practice",
          ])
          .options({ iframes: true })
          .analyze();

        const safeName = pageInfo.name
          .replaceAll(/[^a-z0-9]/gi, "_")
          .toLowerCase()
          .replaceAll(/(^_+)|(_+$)/g, "");
        const reportFileName = `${safeName}-${theme}.html`;

        createHtmlReport({
          results: accessibilityScanResults,
          options: {
            projectKey: `JMRP.io (${theme})`,
            outputDir: "accessibility-report",
            reportFileName: reportFileName,
          },
        });

        // eslint-disable-next-line playwright/no-conditional-in-test
        if (accessibilityScanResults.violations.length > 0) {
          await browserPage.screenshot({
            path: `accessibility-report/${safeName}-${theme}-failure.png`,
            fullPage: true,
          });
        }

        results.push({
          page: `${pageInfo.name} (${pageInfo.url})`,
          violations: accessibilityScanResults.violations.length,
          incomplete: accessibilityScanResults.incomplete.length,
          violationIds: accessibilityScanResults.violations.map((v) => v.id),
          reportPath: reportFileName,
          detailedViolations:
            accessibilityScanResults.violations as AxeResult[],
          detailedIncomplete:
            accessibilityScanResults.incomplete as AxeResult[],
        });

        // Fail the step if violations exist
        expect(
          accessibilityScanResults.violations,
          `${pageInfo.name} has ${accessibilityScanResults.violations.length} accessibility violations`,
        ).toEqual([]);
      });
    }
  });
});
