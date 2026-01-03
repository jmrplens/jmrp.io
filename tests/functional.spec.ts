import { test, expect } from "@playwright/test";
import { getSitemapUrls } from "./utils";

function isCloudflareInsightsError(text: string): boolean {
  // Extract potential URLs from the console message and check their hostnames.
  const urlPattern = /\bhttps?:\/\/[^\s"']+/g;
  const matches = text.match(urlPattern);
  if (!matches) {
    return false;
  }
  for (const candidate of matches) {
    try {
      const url = new URL(candidate);
      const host = url.hostname.toLowerCase();
      if (
        host === "cloudflareinsights.com" ||
        host.endsWith(".cloudflareinsights.com")
      ) {
        return true;
      }
    } catch {
      // Ignore parse errors and continue checking other candidates.
    }
  }
  return false;
}

/**
 * Functional Tests
 * Dynamically generated from the production sitemap.
 * Ensures all pages are accessible and have core layout elements.
 */

test.describe("Site-wide Functional Checks", () => {
  let urls: string[] = [];

  test.beforeAll(async () => {
    urls = await getSitemapUrls();
  });

  // Dynamic tests for every page in the sitemap
  test("check all pages from sitemap", async ({ page }) => {
    // Block the Cloudflare beacon to prevent CORS errors in localhost tests
    await page.route("**/beacon.min.js", (route) => route.abort());
    await page.route("**/cdn-cgi/rum*", (route) => route.abort());

    // Listen for console errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Ignore known CORS/network errors from Cloudflare Analytics
        if (
          isCloudflareInsightsError(text) ||
          text.includes("Access-Control-Allow-Origin") ||
          text.includes("net::ERR_FAILED")
        ) {
          return;
        }
        consoleErrors.push(`[${msg.type()}] ${text}`);
      }
    });

    // Listen for unhandled exceptions
    const pageErrors: Error[] = [];
    page.on("pageerror", (exception) => {
      pageErrors.push(exception);
    });

    for (const url of urls) {
      await test.step(`Checking page: ${url}`, async () => {
        const response = await page.goto(url);
        expect(response?.status()).toBe(200);

        // Fail if there were errors
        expect(consoleErrors, `Console errors on ${url}`).toEqual([]);
        expect(pageErrors, `Page errors on ${url}`).toEqual([]);

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
