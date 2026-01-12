/**
 * Functional Test Suite
 *
 * Site-wide functionality and quality checks:
 * - Page load verification (200 status, no console errors)
 * - Core layout elements (header, footer present)
 * - Interactive features (theme toggle)
 * - External link security (rel="noopener noreferrer")
 * - Image accessibility (alt attributes)
 *
 * Dynamically tests all pages discovered from the sitemap.
 */

import { expect, test } from "@playwright/test";

import { getSitemapUrls, shouldIgnoreError } from "./utils";

let cachedSitemapUrls: string[] | null = null;

async function getCachedSitemapUrls() {
  cachedSitemapUrls ??= await getSitemapUrls();
  return cachedSitemapUrls;
}

test.describe("Site-wide Functional Checks", () => {
  let urls: string[] = [];

  test.beforeAll(async () => {
    urls = await getCachedSitemapUrls();
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
        // Use shared filter to ignore known errors
        if (!shouldIgnoreError(text)) {
          consoleErrors.push(`[${msg.type()}] ${text}`);
        }
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

test.describe("Security & Best Practices", () => {
  test("external links with target=_blank have secure rel attributes", async ({
    page,
  }) => {
    const urls = await getCachedSitemapUrls();

    for (const url of urls) {
      await test.step(`Checking external links: ${url}`, async () => {
        await page.goto(url);

        // Find all external links with target="_blank"
        const externalBlankLinks = page.locator(
          'a[target="_blank"][href^="http"]:not([href*="jmrp.io"]):not([href*="localhost"])',
        );
        const count = await externalBlankLinks.count();

        for (let i = 0; i < count; i++) {
          const link = externalBlankLinks.nth(i);
          const href = await link.getAttribute("href");
          const rel = await link.getAttribute("rel");

          // If rel is missing or doesn't contain noopener, track the issue using soft assertions
          // This avoids the 'no-conditional-in-test' warning by moving the check into an expectation
          expect
            .soft(
              rel,
              `${url}: ${href} is missing rel="noopener" or rel="noreferrer"`,
            )
            .toMatch(/noopener|noreferrer/);
        }
      });
    }

    // Issues are reported via expect.soft above
    // We can add a final sanity check if needed, or rely on soft assertions to fail the test eventually
    // Issues are reported via expect.soft above
  });

  test("images have alt attributes", async ({ page }) => {
    const urls = await getCachedSitemapUrls();

    for (const url of urls) {
      await test.step(`Checking image alt text: ${url}`, async () => {
        await page.goto(url);

        // Find all images (excluding decorative icons in buttons)
        // Find all images (excluding decorative icons in buttons)
        const images = page.locator('img:not([role="presentation"])');
        const count = await images.count();

        for (let i = 0; i < count; i++) {
          const img = images.nth(i);
          const alt = await img.getAttribute("alt");
          const src = await img.getAttribute("src");

          // Images should have alt attribute (can be empty for decorative)
          expect(
            alt !== null,
            `Image ${src} should have an alt attribute`,
          ).toBe(true);
        }
      });
    }
  });
});
