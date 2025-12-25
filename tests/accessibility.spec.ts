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
  const theme = process.env.THEME === "dark" ? "dark" : "light"; // Default to light

  // Load pages once before all tests
  test.beforeAll(async () => {
    pages = await getPagesFromSitemap();

    // Ensure report directory exists
    if (!fs.existsSync("accessibility-report")) {
      fs.mkdirSync("accessibility-report", { recursive: true });
    }
  });

  // Dynamically generate tests for all discovered pages
  test(`should have no accessibility violations on all pages (${theme} mode)`, async ({
    page: browserPage,
  }) => {
    const results: Array<{
      page: string;
      violations: number;
      incomplete: number;
      violationIds?: string[];
      reportPath: string;
    }> = [];

    // Force color scheme based on env var
    await browserPage.emulateMedia({
      colorScheme: theme === "dark" ? "dark" : "light",
    });

    for (const pageInfo of pages) {
      await browserPage.goto(pageInfo.url);
      await browserPage.waitForLoadState("networkidle");

      // Verify theme application (optional, helps debugging)
      await browserPage.evaluate((t) => {
        document.documentElement.setAttribute("data-theme", t);
        if (t === "dark") document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");
      }, theme);

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

      // Generate HTML Report with theme suffix
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

      // Log violations for debugging
      if (accessibilityScanResults.violations.length > 0) {
        console.log(
          `\n⚠️  ${pageInfo.name} (${pageInfo.url}) [${theme}] has ${accessibilityScanResults.violations.length} accessibility violations:\n`,
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
          path: `accessibility-report/${safeName}-${theme}-failure.png`,
          fullPage: true,
        });
      }

      // Log incomplete checks for debugging
      if (accessibilityScanResults.incomplete.length > 0) {
        console.log(
          `\n🔍 ${pageInfo.name} (${pageInfo.url}) [${theme}] has ${accessibilityScanResults.incomplete.length} incomplete checks (need manual review):`,
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
      theme,
      totalPages: results.length,
      passed: results.filter((r) => r.violations === 0).length,
      failed: results.filter((r) => r.violations > 0).length,
      incomplete: results.filter((r) => r.incomplete > 0).length,
      pages: results,
    };
    fs.writeFileSync(
      `accessibility-report/accessibility-summary-${theme}.json`,
      JSON.stringify(summary, null, 2),
    );

    // Assert after generating reports
    const failedPages = results.filter((r) => r.violations > 0);
    for (const failedPage of failedPages) {
      // Fail with detailed message
      expect(
        [],
        `${failedPage.page} [${theme}] has ${failedPage.violations} violations: ${failedPage.violationIds?.join(", ")}`,
      ).toEqual(failedPage.violationIds);
    }
  });
});
