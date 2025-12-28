import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { parseStringPromise } from "xml2js";

/**
 * Functional Tests
 * Dynamically generated from the production sitemap.
 * Ensures all pages are accessible and have core layout elements.
 */

const SITEMAP_PATH = path.resolve("dist/sitemap-0.xml");

// Helper to get URLs from sitemap
async function getSitemapUrls() {
  if (!fs.existsSync(SITEMAP_PATH)) {
    console.warn(
      `Sitemap not found at ${SITEMAP_PATH}. Defaulting to core pages.`,
    );
    return ["/", "/blog/", "/cv/", "/publications/", "/services/"];
  }

  const sitemapContent = fs.readFileSync(SITEMAP_PATH, "utf-8");
  const parsed = await parseStringPromise(sitemapContent);
  const urls = parsed.urlset.url.map((u: any) => {
    const loc = u.loc[0];
    return new URL(loc).pathname;
  });
  return urls;
}

test.describe("Site-wide Functional Checks", () => {
  let urls: string[] = [];

  test.beforeAll(async () => {
    urls = await getSitemapUrls();
  });

  // Dynamic tests for every page in the sitemap
  test("check all pages from sitemap", async ({ page }) => {
    for (const url of urls) {
      await test.step(`Checking page: ${url}`, async () => {
        const response = await page.goto(url);
        expect(response?.status()).toBe(200);

        // Header & Footer should be present on every page
        // Use .first() to avoid strict mode violations if multiple headers/footers exist
        await expect(page.locator("header").first()).toBeVisible();
        await expect(page.locator("footer").first()).toBeVisible();

        // Every page should have a title
        const title = await page.title();
        expect(title.length).toBeGreaterThan(0);
      });
    }
  });
});

test.describe("Interactive Features", () => {
  test("homepage theme toggle works", async ({ page }) => {
    await page.goto("/");

    const html = page.locator("html");
    const toggle = page.locator("#theme-toggle");

    // Force Light Mode
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "light";
      document.documentElement.classList.add("light-mode");
      document.documentElement.classList.remove("dark-mode");
    });
    await expect(html).toHaveAttribute("data-theme", "light");

    // Click to Dark Mode
    await toggle.click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(html).toHaveClass(/dark-mode/);

    // Click back to Light Mode
    await toggle.click();
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect(html).toHaveClass(/light-mode/);
  });
});
