import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { parseStringPromise } from "xml2js";
import * as fs from "fs";
import * as path from "path";
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
              .map((s) =>
                s
                  .split("-")
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
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
    if (!fs.existsSync("playwright-report/accessibility")) {
      fs.mkdirSync("playwright-report/accessibility", { recursive: true });
    }
  });

  // Dynamically generate tests for all discovered pages
  test("should have no accessibility violations on all pages", async ({
    page: browserPage,
  }) => {
    const results: Array<{ page: string; violations: number }> = [];

    for (const pageInfo of pages) {
      await browserPage.goto(pageInfo.url);
      await browserPage.waitForLoadState("networkidle");

      const accessibilityScanResults = await new AxeBuilder({
        page: browserPage,
      })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"])
        .analyze();

      // Generate HTML Report
      const safeName = pageInfo.name
        .replace(/[^a-z0-9]/gi, "_")
        .toLowerCase()
        .replace(/^_+|_+$/g, "");
      const reportFileName = `${safeName}.html`;

      createHtmlReport({
        results: accessibilityScanResults,
        options: {
          projectKey: "JMRP.io",
          outputDir: "playwright-report/accessibility",
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
          path: `playwright-report/accessibility/${safeName}-failure.png`,
          fullPage: true,
        });
      }

      results.push({
        page: `${pageInfo.name} (${pageInfo.url})`,
        violations: accessibilityScanResults.violations.length,
      });

      // Fail immediately if violations found
      expect(
        accessibilityScanResults.violations,
        `${pageInfo.name} (${pageInfo.url}) should have no violations`,
      ).toEqual([]);
    }

    // Summary
    console.log("\n✅ Accessibility Test Summary:");
    console.log(`   Total pages tested: ${results.length}`);
    console.log(
      `   Pages with violations: ${results.filter((r) => r.violations > 0).length}`,
    );

    // Save results to file for CI reporting
    const summary = {
      totalPages: results.length,
      passed: results.filter((r) => r.violations === 0).length,
      failed: results.filter((r) => r.violations > 0).length,
      pages: results,
    };
    fs.writeFileSync(
      "accessibility-summary.json",
      JSON.stringify(summary, null, 2),
    );
  });
});
