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
    });
    await expect(html).toHaveAttribute("data-theme", "light");

    // Click to Dark Mode
    await toggle.click();
    await expect(html).toHaveAttribute("data-theme", "dark");

    // Click back to Light Mode
    await toggle.click();
    await expect(html).toHaveAttribute("data-theme", "light");
  });

  test("theme persists across page navigation", async ({ page }) => {
    await page.goto("/");

    const html = page.locator("html");
    const toggle = page.locator("#theme-toggle");

    // Start with a known state: set to dark via localStorage and reload
    await page.evaluate(() => {
      localStorage.setItem("theme", "dark");
    });
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");

    // Click to switch to light mode
    await toggle.click();
    await expect(html).toHaveAttribute("data-theme", "light");

    // Verify localStorage was updated
    const storedTheme = await page.evaluate(() =>
      localStorage.getItem("theme"),
    );
    expect(storedTheme).toBe("light");

    // Navigate to another page - theme should persist
    await page.goto("/cv/");
    await expect(html).toHaveAttribute("data-theme", "light");

    // Navigate to blog - theme should still persist
    await page.goto("/blog/");
    await expect(html).toHaveAttribute("data-theme", "light");

    // Navigate back to homepage - should still be light
    await page.goto("/");
    await expect(html).toHaveAttribute("data-theme", "light");
  });

  test("mobile menu preserves scroll position on open/close", async ({
    page,
  }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Use a long page (blog post) to test scroll behavior
    await page.goto("/blog/003-implementing-content-security-policy-nginx/");

    // Scroll down to a specific position
    const targetScrollY = 500;
    await page.evaluate((y) => window.scrollTo(0, y), targetScrollY);

    // Wait for scroll to complete and verify position
    await page.waitForFunction(
      (y) => Math.abs(window.scrollY - y) < 10,
      targetScrollY,
    );

    const scrollBeforeOpen = await page.evaluate(() => window.scrollY);
    expect(scrollBeforeOpen).toBeGreaterThan(400);

    // Open the mobile menu
    const menuToggle = page.locator("#menu-toggle");
    await menuToggle.click();
    await expect(page.locator("#nav-links")).toHaveClass(/open/);
    await expect(page.locator("body")).toHaveClass(/menu-open/);

    // Verify body has position:fixed (scroll lock active)
    const bodyPosition = await page.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue("position"),
    );
    expect(bodyPosition).toBe("fixed");

    // Close the menu
    await page.keyboard.press("Escape");
    await expect(page.locator("#nav-links")).not.toHaveClass(/open/);
    await expect(page.locator("body")).not.toHaveClass(/menu-open/);

    // Verify scroll position is restored (within tolerance for sub-pixel differences)
    const scrollAfterClose = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrollAfterClose - scrollBeforeOpen)).toBeLessThan(10);
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
        // Exclude: jmrp.io (own domain), localhost (dev), Astro Dev Toolbar links (astro.build, withastro)
        const externalBlankLinks = page.locator(
          'a[target="_blank"][href^="http"]:not([href*="jmrp.io"]):not([href*="localhost"]):not([href*="astro.build"]):not([href*="withastro"]):not([href*="docs.astro.build"])',
        );
        const count = await externalBlankLinks.count();

        for (let i = 0; i < count; i++) {
          const link = externalBlankLinks.nth(i);
          const href = await link.getAttribute("href");
          const rel = await link.getAttribute("rel");

          // If rel is missing or doesn't contain both noopener and noreferrer, track the issue using soft assertions
          // Using regex with positive lookaheads to require both tokens in any order
          expect
            .soft(rel, `${url}: ${href} is missing rel="noopener noreferrer"`)
            .toMatch(/(?=.*noopener)(?=.*noreferrer)/);
        }
      });
    }

    // Fail test if any soft assertions failed
    expect(
      test.info().errors,
      "Some external links are missing secure rel attributes",
    ).toHaveLength(0);
  });

  test("images have alt attributes", async ({ page }) => {
    const urls = await getCachedSitemapUrls();

    for (const url of urls) {
      await test.step(`Checking image alt text: ${url}`, async () => {
        await page.goto(url);

        // Find all images (excluding decorative icons in buttons)
        const images = page.locator('img:not([role="presentation"])');
        const count = await images.count();

        for (let i = 0; i < count; i++) {
          const img = images.nth(i);
          const alt = await img.getAttribute("alt");
          const src = await img.getAttribute("src");
          const ariaHidden = await img.getAttribute("aria-hidden");
          const role = await img.getAttribute("role");

          // Skip purely decorative images (aria-hidden or role="none")
          const isDecorative = ariaHidden === "true" || role === "none";

          // Images should have alt attribute
          expect
            .soft(alt !== null, `Image ${src} should have an alt attribute`)
            .toBe(true);

          // Non-decorative images should have meaningful alt (not just filename patterns)
          // eslint-disable-next-line playwright/no-conditional-in-test -- Required for decorative image check
          if (!isDecorative && alt !== null && alt !== "") {
            // Check for common placeholder patterns that indicate missing alt text
            const isPlaceholder =
              /^(image|img|photo|picture|untitled|dsc_?\d+|img_?\d+)\.?/i.test(
                alt,
              );
            // eslint-disable-next-line playwright/no-conditional-expect -- Inside required conditional
            expect
              .soft(
                !isPlaceholder,
                `Image ${src} has placeholder alt text: "${alt}"`,
              )
              .toBe(true);
          }
        }
      });
    }

    // Fail test if any soft assertions failed
    expect(
      test.info().errors,
      "Some images have missing or placeholder alt attributes",
    ).toHaveLength(0);
  });
});
