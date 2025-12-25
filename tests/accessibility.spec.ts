import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { parseStringPromise } from "xml2js";
import * as fs from "node:fs";
import * as path from "node:path";
// @ts-ignore
import { createHtmlReport } from "axe-html-reporter";

// Read and parse sitemap to discover all pages automatically
async function getPagesFromSitemap(): Promise<
  Array<{ name: string; url: string }>
> {
  const sitemapPath = path.join(process.cwd(), "dist", "sitemap-0.xml");

  if (!fs.existsSync(sitemapPath)) {
    console.warn("⚠️  Sitemap not found, using manual page list");
    return getManualPages();
  }

  try {
    const sitemapContent = fs.readFileSync(sitemapPath, "utf-8");
    const sitemap = await parseStringPromise(sitemapContent);

    const urls = sitemap.urlset.url.map((entry: any) => {
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

    console.log(`📄 Found ${urls.length} pages in sitemap`);
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

  // Load pages once before all tests
  test.beforeAll(async () => {
    pages = await getPagesFromSitemap();

    // Ensure report directory exists
    if (!fs.existsSync("accessibility-report")) {
      fs.mkdirSync("accessibility-report", { recursive: true });
    }
  });

  // Dynamically generate tests for all discovered pages
  test("should have no accessibility violations on all pages", async ({
    page: browserPage,
  }) => {
    const results: Array<{
      page: string;
      violations: number;
      incomplete: number;
      violationIds?: string[];
      reportPath: string;
    }> = [];

    for (const pageInfo of pages) {
      await browserPage.goto(pageInfo.url);
      await browserPage.waitForLoadState("networkidle");

      // Accessibility: Wait for fonts to be ready to ensure correct contrast calculation
      await browserPage.evaluate(() => document.fonts.ready);

      // Accessibility: Fix Incomplete color-contrast checks due to gradients
      // We temporarily set a solid background color derived from the gradient
      await browserPage.evaluate(() => {
        const elements = document.querySelectorAll("*");
        elements.forEach((el) => {
          const style = globalThis.getComputedStyle(el);
          const bg = style.backgroundImage;
          if (bg?.includes("gradient")) {
            // Very simple heuristic: try to find a color-like string in the gradient
            // or just use the theme's background color as a safe fallback for the engine
            const colorMatch =
              /(#[a-f0-9]{3,6}|rgba?\([^)]+\)|var\(--[^)]+\))/.exec(bg);
            if (colorMatch) {
              (el as HTMLElement).style.backgroundColor = colorMatch[0];
            }
          }
        });
      });

      const accessibilityScanResults = await new AxeBuilder({
        page: browserPage,
      })
        .exclude(["svg"]) // Exclude all SVGs as requested by user to avoid false positives in diagrams
        .withTags([
          "wcag2a",
          "wcag2aa",
          "wcag21aa",
          "wcag22aa",
          "best-practice",
        ])
        .options({ iframes: true })
        .analyze();

      // Generate HTML Report
      const safeName = pageInfo.name
        .replaceAll(/[^a-z0-9]/gi, "_")
        .toLowerCase()
        .replaceAll(/(^_+)|(_+$)/g, "");
      const reportFileName = `${safeName}.html`;

      createHtmlReport({
        results: accessibilityScanResults,
        options: {
          projectKey: "JMRP.io",
          outputDir: "accessibility-report",
          reportFileName: reportFileName,
        },
      });

      // Log violations for debugging
      if (accessibilityScanResults.violations.length > 0) {
        console.log(
          `\n⚠️  ${pageInfo.name} (${pageInfo.url}) has ${accessibilityScanResults.violations.length} accessibility violations:\n`,
        );
        accessibilityScanResults.violations.forEach((violation, index) => {
          console.log(
            `${index + 1}. ${violation.id}: ${violation.description}`,
          );
          console.log(`   Impact: ${violation.impact}`);
          console.log(`   Help: ${violation.helpUrl}`);
          console.log(`   Affected elements: ${violation.nodes.length}\n`);
        });

        // Screenshot on failure
        await browserPage.screenshot({
          path: `accessibility-report/${safeName}-failure.png`,
          fullPage: true,
        });
      }

      // Log incomplete checks for debugging
      if (accessibilityScanResults.incomplete.length > 0) {
        console.log(
          `\n🔍 ${pageInfo.name} (${pageInfo.url}) has ${accessibilityScanResults.incomplete.length} incomplete checks (need manual review):`,
        );
        accessibilityScanResults.incomplete.forEach((incomplete, index) => {
          console.log(
            `${index + 1}. ${incomplete.id}: ${incomplete.description}`,
          );
          incomplete.nodes.forEach((node) => {
            console.log(`   - Node HTML: ${node.html}`);
            console.log(`   - Reason: ${node.any[0]?.message || "Unknown"}`);
          });
        });
      }

      results.push({
        page: `${pageInfo.name} (${pageInfo.url})`,
        violations: accessibilityScanResults.violations.length,
        incomplete: accessibilityScanResults.incomplete.length,
        violationIds: accessibilityScanResults.violations.map((v) => v.id),
        reportPath: reportFileName,
      });
    }

    // Generate summary BEFORE assertions so it's available even if tests fail
    const summary = {
      totalPages: results.length,
      passed: results.filter((r) => r.violations === 0).length,
      failed: results.filter((r) => r.violations > 0).length,
      incomplete: results.filter((r) => r.incomplete > 0).length,
      pages: results,
    };
    fs.writeFileSync(
      "accessibility-report/accessibility-summary.json",
      JSON.stringify(summary, null, 2),
    );

    // Generate Master Index HTML
    const indexHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Accessibility Report Index - JMRP.io</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 1000px; margin: 0 auto; padding: 2rem; background: #f4f7f6; }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 0.5rem; }
        .summary { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 2rem; }
        .summary-stats { display: flex; gap: 2rem; }
        .stat-item { text-align: center; }
        .stat-value { font-size: 2rem; font-weight: bold; display: block; }
        .stat-label { color: #7f8c8d; text-transform: uppercase; font-size: 0.8rem; }
        table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        th, td { padding: 1rem; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #3498db; color: white; text-transform: uppercase; font-size: 0.9rem; }
        tr:hover { background: #f9f9f9; }
        .status-pass { color: #27ae60; font-weight: bold; }
        .status-fail { color: #e74c3c; font-weight: bold; }
        .status-review { color: #f39c12; font-weight: bold; }
        .btn { display: inline-block; padding: 0.5rem 1rem; background: #3498db; color: white; text-decoration: none; border-radius: 4px; font-size: 0.9rem; transition: background 0.2s; }
        .btn:hover { background: #2980b9; }
    </style>
</head>
<body>
    <h1>♿ Accessibility Test Results</h1>
    <div class="summary">
        <div class="summary-stats">
            <div class="stat-item">
                <span class="stat-value">${results.length}</span>
                <span class="stat-label">Total Pages</span>
            </div>
            <div class="stat-item">
                <span class="stat-value status-pass">${results.filter((r) => r.violations === 0).length}</span>
                <span class="stat-label">Passed</span>
            </div>
            <div class="stat-item">
                <span class="stat-value ${results.some((r) => r.violations > 0) ? "status-fail" : "status-pass"}">${results.filter((r) => r.violations > 0).length}</span>
                <span class="stat-label">Failed</span>
            </div>
            <div class="stat-item">
                <span class="stat-value status-review">${results.filter((r) => r.incomplete > 0).length}</span>
                <span class="stat-label">Review Needed</span>
            </div>
        </div>
        <p>Generated on: ${new Date().toLocaleString()}</p>
    </div>

    <table>
        <thead>
            <tr>
                <th>Page Name & URL</th>
                <th>Violations</th>
                <th>Incomplete (Review)</th>
                <th>Report</th>
            </tr>
        </thead>
        <tbody>
            ${results
              .map(
                (r) => `
                <tr>
                    <td>${r.page}</td>
                    <td><span class="${r.violations === 0 ? "status-pass" : "status-fail"}">${r.violations}</span></td>
                    <td><span class="${r.incomplete === 0 ? "" : "status-review"}">${r.incomplete}</span></td>
                    <td><a href="${r.reportPath}" class="btn">View Details</a></td>
                </tr>
            `,
              )
              .join("")}
        </tbody>
    </table>
</body>
</html>
    `;
    fs.writeFileSync("accessibility-report/index.html", indexHtml);

    // Summary console log
    console.log("\n✅ Accessibility Test Summary:");
    console.log(`   Total pages tested: ${results.length}`);
    console.log(
      `   Pages with violations: ${results.filter((r) => r.violations > 0).length}`,
    );
    console.log(
      `   Pages requiring review: ${results.filter((r) => r.incomplete > 0).length}`,
    );

    // Assert after generating reports
    const failedPages = results.filter((r) => r.violations > 0);
    for (const failedPage of failedPages) {
      // Fail with detailed message
      expect(
        [],
        `${failedPage.page} has ${failedPage.violations} violations: ${failedPage.violationIds?.join(", ")}`,
      ).toEqual(failedPage.violationIds);
    }
  });
});
