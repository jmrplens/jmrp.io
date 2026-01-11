/**
 * Accessibility Test Suite
 *
 * Automated accessibility testing using Axe-core and Playwright.
 * Scans all pages discovered from the sitemap and generates reports
 * for both light and dark themes.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createHtmlReport } from "axe-html-reporter";
import { parseStringPromise } from "xml2js";

import { escapeHtml } from "../scripts/utils/html.mjs"; // Import shared utility
// import type { AxeResults } from "axe-core"; // Types are problematic

/** Represents a single DOM node flagged by Axe-core. */
interface AxeNode {
  html: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  target: any; // Axe-core uses complex selectors (UnlabelledFrameSelector)
  failureSummary?: string;
}

/** Represents an Axe-core rule result (violation, pass, incomplete). */
interface Result {
  id: string;
  impact?: string | null;
  tags: string[];
  description: string;
  help: string;
  helpUrl: string;
  nodes: AxeNode[];
}

/** Aggregated result with node count instead of full node details. */
type AggregatedResult = Omit<Result, "nodes"> & { nodes: number };

/** URL entry from parsed sitemap XML. */
interface SitemapUrl {
  loc: string[];
}

/** URL set container from parsed sitemap XML. */
interface SitemapUrlSet {
  url: SitemapUrl[];
}

/** Root structure of parsed sitemap XML. */
interface SitemapResult {
  urlset: SitemapUrlSet;
}

// Read and parse sitemap to discover all pages automatically
async function getPagesFromSitemap(): Promise<
  Array<{ name: string; url: string }>
> {
  console.log(`📂 Current directory: ${process.cwd()}`);
  const sitemapFiles = ["sitemap-0.xml", "sitemap.xml", "sitemap-index.xml"];
  let sitemapPath = "";

  for (const file of sitemapFiles) {
    const testPath = path.join(process.cwd(), "dist", file);
    if (fs.existsSync(testPath)) {
      sitemapPath = testPath;
      break;
    }
  }

  if (!sitemapPath) {
    console.warn("⚠️  Sitemap not found in dist/, using manual page list");
    return getManualPages();
  }

  console.log(`🔍 Using sitemap at: ${sitemapPath}`);

  try {
    const sitemapContent = fs.readFileSync(sitemapPath, "utf-8");
    const sitemap = (await parseStringPromise(sitemapContent)) as SitemapResult;

    let urls = sitemap.urlset.url.map((entry) => {
      const fullUrl = entry.loc[0];
      const urlPath = fullUrl.replace("https://jmrp.io", "");

      // Generate friendly name from path
      const name =
        urlPath === "/"
          ? "Home"
          : urlPath
              .split("/")
              .filter(Boolean)
              .map((s: string) =>
                s
                  .split("-")
                  .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(" "),
              )
              .join(" - ");

      return { name, url: urlPath };
    });

    // Optimization: Only include the first tag page encountered
    let tagFound = false;
    urls = urls.filter((page) => {
      if (page.url.includes("/blog/tags/")) {
        if (tagFound) return false;
        tagFound = true;
      }
      return true;
    });

    console.log(`📄 Found ${urls.length} optimized pages in sitemap`);
    return urls;
  } catch (error) {
    console.error("❌ Error parsing sitemap:", error);
    return getManualPages();
  }
}

function getManualPages(): Array<{ name: string; url: string }> {
  return [
    { name: "Home", url: "/" },
    { name: "Publications", url: "/publications" },
    { name: "CV", url: "/cv" },
    { name: "GitHub", url: "/github" },
    { name: "Services", url: "/services" },
    { name: "Blog Index", url: "/blog" },
  ];
}

/** Page scan result with violation details. */
interface PageResult {
  page: string;
  violations: number;
  incomplete: number;
  violationIds?: string[];
  reportPath: string;
  detailedViolations: Result[];
  detailedIncomplete: Result[];
}

/**
 * Aggregates Axe-core results across all pages into unique rule counts.
 * @param pageResults - Array of page scan results
 * @param field - Field name to aggregate ('detailedViolations' or 'detailedIncomplete')
 * @returns Map of unique rule IDs to aggregated results
 */
function aggregateResults(
  pageResults: PageResult[],
  field: "detailedViolations" | "detailedIncomplete",
): Map<string, AggregatedResult> {
  const uniqueMap = new Map<string, AggregatedResult>();

  for (const pageResult of pageResults) {
    for (const item of pageResult[field]) {
      if (!uniqueMap.has(item.id)) {
        uniqueMap.set(item.id, { ...item, nodes: 0 });
      }
      const existing = uniqueMap.get(item.id);
      if (existing) {
        existing.nodes += item.nodes.length;
      }
    }
  }

  return uniqueMap;
}

/**
 * Generates the accessibility report index HTML page.
 */
function generateReportIndexHtml(
  theme: string,
  summary: { passed: number; failed: number; totalPages: number },
  pageResults: PageResult[],
): string {
  const pageListHtml = pageResults
    .map(
      (r) => `
        <li class="page-item">
          <a href="${escapeHtml(r.reportPath)}" class="page-link">
            <span class="status">${r.violations === 0 ? "✅" : "❌"}</span>
            <div class="details">
              <span class="page-name">${escapeHtml(r.page.split("(")[0].trim())}</span>
              <div style="margin-top: 4px;">
                <span class="page-url">${escapeHtml(/\((.*?)\)/.exec(r.page)?.[1] || "")}</span>
              </div>
              ${r.violations > 0 ? `<div class="violations">⚠️ ${r.violations} violations found</div>` : ""}
            </div>
            <div style="color: #999;">&rarr;</div>
          </a>
        </li>
      `,
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Accessibility Report Index (${theme})</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; }
        h1 { border-bottom: 2px solid #eee; padding-bottom: 10px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 30px; }
        .card { padding: 15px; border-radius: 8px; background: #f5f5f5; text-align: center; border: 1px solid #ddd; }
        .card.failed { background: #ffebee; color: #c62828; border-color: #ef9a9a; }
        .card.passed { background: #e8f5e9; color: #2e7d32; border-color: #a5d6a7; }
        .card h2 { margin: 0; font-size: 2em; }
        .card p { margin: 5px 0 0; color: inherit; font-size: 0.9em; opacity: 0.9; }
        .page-list { list-style: none; padding: 0; border: 1px solid #eee; border-radius: 8px; overflow: hidden; }
        .page-item { border-bottom: 1px solid #eee; }
        .page-item:last-child { border-bottom: none; }
        .page-item:hover { background: #f9f9f9; }
        .page-link { display: flex; align-items: center; padding: 15px; text-decoration: none; color: inherit; }
        .status { margin-right: 15px; font-size: 1.5em; }
        .details { flex-grow: 1; }
        .page-name { font-weight: bold; display: block; font-size: 1.1em; }
        .page-url { color: #666; font-size: 0.85em; font-family: monospace; background: #eee; padding: 2px 5px; border-radius: 4px; }
        .violations { color: #c62828; font-size: 0.9em; margin-top: 5px; font-weight: bold; }
      </style>
    </head>
    <body>
      <h1>Accessibility Reports (${theme === "dark" ? "Dark" : "Light"} Mode)</h1>
      
      <div class="summary">
        <div class="card ${summary.failed === 0 ? "passed" : ""}">
          <h2>${summary.passed}</h2>
          <p>Passed</p>
        </div>
        <div class="card ${summary.failed > 0 ? "failed" : ""}">
          <h2>${summary.failed}</h2>
          <p>Failed</p>
        </div>
        <div class="card">
          <h2>${summary.totalPages}</h2>
          <p>Total Pages</p>
        </div>
      </div>

      <h3>Page Reports</h3>
      <ul class="page-list">
        ${pageListHtml}
      </ul>
      <p style="text-align: center; margin-top: 30px; color: #999; font-size: 0.8em;">Generated by Playwright & Axe-core</p>
    </body>
    </html>
  `;
}

test.describe("Accessibility Tests (Axe-core WCAG 2.1 AA)", () => {
  let pages: Array<{ name: string; url: string }>;
  const theme = process.env.THEME === "dark" ? "dark" : "light";
  const results: PageResult[] = [];

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
    const uniqueViolations = aggregateResults(results, "detailedViolations");
    const uniqueIncomplete = aggregateResults(results, "detailedIncomplete");

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
    const indexHtml = generateReportIndexHtml(theme, summary, results);
    fs.writeFileSync("accessibility-report/index.html", indexHtml);
    console.log(
      "✅ Accessibility index written to: accessibility-report/index.html",
    );
  });

  // Dynamically generate tests for all discovered pages
  test(`should have no accessibility violations on all pages (${theme} mode)`, async ({
    page: browserPage,
  }) => {
    // Force color scheme based on env var
    await browserPage.emulateMedia({
      colorScheme: theme === "dark" ? "dark" : "light",
    });

    for (const pageInfo of pages) {
      // ... same inner logic until end of loop
      // (Simplified replacement to ensure stability)
      await browserPage.goto(pageInfo.url);
      await browserPage.waitForLoadState("domcontentloaded");

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
        detailedViolations: accessibilityScanResults.violations,
        detailedIncomplete: accessibilityScanResults.incomplete,
      });
    }

    // Assert after generating reports
    const failedPages = results.filter((r) => r.violations > 0);
    for (const failedPage of failedPages) {
      expect(
        [],
        `${failedPage.page} [${theme}] has ${failedPage.violations} violations: ${failedPage.violationIds?.join(", ")}`,
      ).toEqual(failedPage.violationIds);
    }
  });
});
