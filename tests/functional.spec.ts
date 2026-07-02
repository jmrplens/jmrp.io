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
 * Per-page tests run in parallel across workers for maximum performance.
 * Dynamically tests all pages discovered from the sitemap.
 */

import { expect, test } from "@playwright/test";

import { getCachedPages, shouldIgnoreError } from "./utils";

// Read pages synchronously at module scope for parallel test registration
const pages = getCachedPages();

test.describe("Site-wide Functional Checks", () => {
  for (const pageInfo of pages) {
    test(`Page: ${pageInfo.name}`, async ({ page }) => {
      // Block the Cloudflare beacon to prevent CORS errors in localhost tests
      await page.route("**/beacon.min.js", (route) => route.abort());
      await page.route("**/cdn-cgi/rum*", (route) => route.abort());

      // Listen for console errors
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() !== "error") {
          return;
        }

        const text = msg.text();
        if (!shouldIgnoreError(text)) {
          consoleErrors.push(`[${msg.type()}] ${text}`);
        }
      });

      // Listen for unhandled exceptions
      const pageErrors: Error[] = [];
      page.on("pageerror", (exception) => {
        pageErrors.push(exception);
      });

      const response = await page.goto(pageInfo.url);

      // --- Functional checks ---
      await test.step("Status, structure & console errors", async () => {
        expect(response?.status()).toBe(200);
        expect(consoleErrors, `Console errors on ${pageInfo.url}`).toEqual([]);
        expect(pageErrors, `Page errors on ${pageInfo.url}`).toEqual([]);
        await expect(page.locator("header").first()).toBeVisible();
        await expect(page.locator("footer").first()).toBeVisible();
        const title = await page.title();
        expect(title.length).toBeGreaterThan(0);
      });

      // --- External links security ---
      await test.step("External links have secure rel attributes", async () => {
        const externalBlankLinks = page.locator(
          'a[target="_blank"][href^="http"]:not([href*="jmrp.io"]):not([href*="localhost"]):not([href*="astro.build"]):not([href*="withastro"])',
        );
        const count = await externalBlankLinks.count();

        for (let i = 0; i < count; i++) {
          const link = externalBlankLinks.nth(i);
          const href = await link.getAttribute("href");
          const rel = await link.getAttribute("rel");
          expect
            .soft(
              rel,
              `${pageInfo.url}: ${href} is missing rel="noopener noreferrer"`,
            )
            .toMatch(/(?=.*noopener)(?=.*noreferrer)/);
        }
      });

      // --- Image accessibility ---
      /* eslint-disable playwright/no-conditional-in-test -- Required for decorative image checks */
      await test.step("Images have alt attributes", async () => {
        const images = page.locator(
          'img:not([role="presentation"]):not([role="none"])',
        );
        const count = await images.count();

        for (let i = 0; i < count; i++) {
          const img = images.nth(i);
          const alt = await img.getAttribute("alt");
          const src = await img.getAttribute("src");
          const ariaHidden = await img.getAttribute("aria-hidden");
          const role = await img.getAttribute("role");
          const isDecorative =
            ariaHidden === "true" || role === "none" || role === "presentation";

          if (!isDecorative) {
            // eslint-disable-next-line playwright/no-conditional-expect
            expect
              .soft(alt !== null, `Image ${src} should have an alt attribute`)
              .toBe(true);
            // eslint-disable-next-line playwright/no-conditional-expect
            expect
              .soft(
                alt !== null && alt !== "",
                `Image ${src} should have a non-empty alt attribute`,
              )
              .toBe(true);
          }

          if (!isDecorative && alt !== null && alt !== "") {
            const isPlaceholder =
              /^(image|img|photo|picture|untitled|dsc_?\d+|img_?\d+)(\.[a-z]+)?$/i.test(
                alt,
              );
            // eslint-disable-next-line playwright/no-conditional-expect
            expect
              .soft(
                !isPlaceholder,
                `Image ${src} has placeholder alt text: "${alt}"`,
              )
              .toBe(true);
          }
        }
      });
      /* eslint-enable playwright/no-conditional-in-test */

      // Fail if any soft assertions failed
      expect(
        test.info().errors,
        "Soft assertion failures on this page",
      ).toHaveLength(0);
    });
  }
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
    await expect(page.locator("#nav-drawer")).toHaveClass(/open/);
    await expect(page.locator("body")).toHaveClass(/menu-open/);

    // Verify body has position:fixed (scroll lock active)
    const bodyPosition = await page.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue("position"),
    );
    expect(bodyPosition).toBe("fixed");

    // Close the menu
    await page.keyboard.press("Escape");
    await expect(page.locator("#nav-drawer")).not.toHaveClass(/open/);
    await expect(page.locator("body")).not.toHaveClass(/menu-open/);

    // Verify scroll position is restored (within tolerance for sub-pixel differences)
    const scrollAfterClose = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrollAfterClose - scrollBeforeOpen)).toBeLessThan(10);
  });
});
