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
  const results: Array<{
    page: string;
    violations: number;
    incomplete: number;
    violationIds?: string[];
    reportPath: string;
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
    // Generate summary after all tests are done
    const summary = {
      theme,
      totalPages: results.length,
      passed: results.filter((r) => r.violations === 0).length,
      failed: results.filter((r) => r.violations > 0).length,
      incomplete: results.filter((r) => r.incomplete > 0).length,
      pages: results,
    };
    const summaryPath = `accessibility-report/accessibility-summary-${theme}.json`;
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`✅ Accessibility summary written to: ${summaryPath}`);
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
