import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { parseStringPromise } from "xml2js";
import * as fs from "node:fs";
import * as path from "node:path";

import { createHtmlReport } from "axe-html-reporter";

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
    const sitemap = await parseStringPromise(sitemapContent);

    let urls = sitemap.urlset.url.map((entry: any) => {
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
    urls = urls.filter((page: any) => {
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

// Fallback: Manual page list (used if sitemap not available)
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

test.describe("Accessibility Tests (Axe-core WCAG 2.1 AA)", () => {
  let pages: Array<{ name: string; url: string }>;
  const theme = process.env.THEME === "dark" ? "dark" : "light"; // Default to light
  /* Updated results structure to store full violation details for aggregation */
  const results: Array<{
    page: string;
    violations: number;
    incomplete: number;
    violationIds?: string[];
    reportPath: string;
    detailedViolations: any[]; // Store full Axe violations
    detailedIncomplete: any[]; // Store full Axe incomplete
  }> = [];

  // Load pages once before all tests
  test.beforeAll(async () => {
    pages = await getPagesFromSitemap();

    // Ensure report directory exists
    if (!fs.existsSync("accessibility-report")) {
      fs.mkdirSync("accessibility-report", { recursive: true });
    }
  });

  test.afterAll(async () => {
    // Aggregating violations across all pages
    const uniqueViolations = new Map<string, any>();
    const uniqueIncomplete = new Map<string, any>();

    results.forEach((pageResult) => {
      pageResult.detailedViolations.forEach((v) => {
        if (!uniqueViolations.has(v.id)) {
          uniqueViolations.set(v.id, {
            id: v.id,
            impact: v.impact,
            description: v.description,
            nodes: 0,
          });
        }
        uniqueViolations.get(v.id).nodes += v.nodes.length;
      });

      pageResult.detailedIncomplete.forEach((i) => {
        if (!uniqueIncomplete.has(i.id)) {
          uniqueIncomplete.set(i.id, {
            id: i.id,
            impact: i.impact,
            description: i.description,
            nodes: 0,
          });
        }
        uniqueIncomplete.get(i.id).nodes += i.nodes.length;
      });
    });

    // Generate summary after all tests are done
    const summary = {
      theme,
      totalPages: results.length,
      passed: results.filter((r) => r.violations === 0).length,
      failed: results.filter((r) => r.violations > 0).length,
      incomplete: results.filter((r) => r.incomplete > 0).length,
      violations: Array.from(uniqueViolations.values()),
      incompleteList: Array.from(uniqueIncomplete.values()),
      pages: results.map(({ detailedViolations, detailedIncomplete, ...rest }) => rest), // Exclude heavy details from pages list in summary
    };
    const summaryPath = `accessibility-report/accessibility-summary-${theme}.json`;
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`✅ Accessibility summary written to: ${summaryPath}`);

    const escapeHtml = (unsafe: string) =>
      unsafe
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    // Generate index.html for navigation
    const indexHtml = `
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
        <h1>Accessibility Reports (${theme === "dark" ? "Dark" : "Light"
      } Mode)</h1>
        
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
          ${results
        .map(
          (r) => `
            <li class="page-item">
              <a href="${escapeHtml(r.reportPath)}" class="page-link">
                <span class="status">${r.violations === 0 ? "✅" : "❌"}</span>
                <div class="details">
                  <span class="page-name">${escapeHtml(r.page.split("(")[0].trim())}</span>
                  <div style="margin-top: 4px;">
                    <span class="page-url">${escapeHtml(
            /\((.*?)\)/.exec(r.page)?.[1] || "",
          )}</span>
                  </div>
                  ${r.violations > 0
              ? `<div class="violations">⚠️ ${r.violations} violations found</div>`
              : ""
            }
                </div>
                <div style="color: #999;">&rarr;</div>
              </a>
            </li>
          `,
        )
        .join("")}
        </ul>
        <p style="text-align: center; margin-top: 30px; color: #999; font-size: 0.8em;">Generated by Playwright & Axe-core</p>
      </body>
      </html>
    `;
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
      await browserPage.waitForLoadState("networkidle");

      // Verify theme application
      await browserPage.evaluate((t) => {
        document.documentElement.dataset.theme = t;
        if (t === "dark") document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");
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
