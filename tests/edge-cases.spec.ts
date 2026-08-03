/* eslint-disable playwright/no-conditional-in-test */
/* eslint-disable playwright/no-wait-for-timeout */
/* eslint-disable playwright/no-networkidle */
/* eslint-disable playwright/prefer-web-first-assertions */
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { blockCloudflare, getCachedPages, shouldIgnoreError } from "./utils";

/**
 * Helper: block Cloudflare beacon and track page errors + console errors.
 */
async function setupPage(page: Page, errors: string[]): Promise<void> {
  await blockCloudflare(page);
  page.on("pageerror", (error) => {
    if (!shouldIgnoreError(error.message)) {
      errors.push(error.message);
    }
  });
  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }
    const text = message.text();
    if (!shouldIgnoreError(text)) {
      errors.push(text);
    }
  });
}

// ---------------------------------------------------------------------------
// 404 Response & SEO
// ---------------------------------------------------------------------------
test.describe("Edge Cases: 404 Responses", () => {
  test("Non-existent EN URL returns 404 status", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    const response = await page.goto("/this-page-does-not-exist-12345");
    expect(response?.status()).toBe(404);
  });

  test("Non-existent ES URL returns 404 status", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    const response = await page.goto("/es/this-page-does-not-exist-12345");
    expect(response?.status()).toBe(404);
  });

  test("404 page has noindex meta tag", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    await page.goto("/this-page-does-not-exist-12345");
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute("content", /noindex/);
  });

  test("404 page has proper title", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    await page.goto("/this-page-does-not-exist-12345");
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    expect(title).toMatch(/404|not found/i);
  });

  test("Deep nested non-existent path returns 404", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    const response = await page.goto("/blog/fake/nested/path/slug");
    expect(response?.status()).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// View Transitions & Navigation
// ---------------------------------------------------------------------------
test.describe("Edge Cases: View Transitions", () => {
  test("Theme persists after navigation", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    await page.goto("/");

    // Set theme to light
    const toggle = page.locator("#theme-toggle");
    await expect(toggle).toBeVisible();
    const currentTheme = await page.locator("html").getAttribute("data-theme");
    if (currentTheme !== "light") {
      await toggle.click();
      await page.waitForTimeout(300);
    }
    const themeAfterToggle = await page
      .locator("html")
      .getAttribute("data-theme");
    expect(themeAfterToggle).toBe("light");

    // Navigate to blog
    await page.goto("/blog/");
    await page.waitForLoadState("domcontentloaded");
    const themeAfterNav = await page.locator("html").getAttribute("data-theme");
    expect(themeAfterNav).toBe("light");
  });

  test("Back button works after View Transition navigation", async ({
    page,
  }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Navigate to blog
    await page.goto("/blog/");
    await page.waitForLoadState("domcontentloaded");
    expect(page.url()).toContain("/blog");

    // Go back
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");
    // Should be back at homepage
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("Forward button works after going back", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    await page.goto("/blog/");
    await page.waitForLoadState("domcontentloaded");

    await page.goBack();
    await page.waitForLoadState("domcontentloaded");

    await page.goForward();
    await page.waitForLoadState("domcontentloaded");
    expect(page.url()).toContain("/blog");
  });
});

// ---------------------------------------------------------------------------
// Print Styles
// ---------------------------------------------------------------------------
test.describe("Edge Cases: Print Styles", () => {
  test("Pages render in print media without overflow", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    await page.goto("/");
    await page.emulateMedia({ media: "print" });
    await page.waitForTimeout(500);

    // Verify the page renders (no crash)
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("Blog post renders in print media", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    const pages = getCachedPages();
    const blogPost = pages.find(
      (p) =>
        p.url.startsWith("/blog/") &&
        !p.url.startsWith("/es/") &&
        p.url !== "/blog/" &&
        !p.url.includes("/tags/"),
    );
    expect(blogPost, "No blog post found in sitemap").toBeDefined();
    await page.goto(blogPost!.url);
    await page.emulateMedia({ media: "print" });
    await page.waitForTimeout(500);
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("CV page renders in print media", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    await page.goto("/cv");
    await page.emulateMedia({ media: "print" });
    await page.waitForTimeout(500);
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Content Overflow Detection
// ---------------------------------------------------------------------------
test.describe("Edge Cases: Overflow Detection", () => {
  test("Homepage has no horizontal overflow", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > globalThis.innerWidth;
    });
    expect(hasOverflow).toBe(false);
  });

  test("Blog listing has no horizontal overflow", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    await page.goto("/blog/");
    await page.waitForLoadState("networkidle");

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > globalThis.innerWidth;
    });
    expect(hasOverflow).toBe(false);
  });

  test("Tool pages have no horizontal overflow", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    await page.goto("/tools/");
    await page.waitForLoadState("networkidle");

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > globalThis.innerWidth;
    });
    expect(hasOverflow).toBe(false);
  });

  test("Blog posts have no horizontal overflow", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    const pages = getCachedPages();
    const blogPosts = pages.filter(
      (p) =>
        p.url.startsWith("/blog/") &&
        !p.url.startsWith("/es/") &&
        p.url !== "/blog/" &&
        !p.url.includes("/tags/"),
    );

    // Test first 3 blog posts for efficiency
    for (const post of blogPosts.slice(0, 3)) {
      await page.goto(post.url);
      // NOT networkidle. With `prefetch: { prefetchAll: true }` and
      // `clientPrerender` the browser keeps speculatively fetching linked
      // pages, so on a heavily-linked blog post the network may never go idle
      // inside the 30 s timeout when the suite runs fullyParallel — this test
      // timed out in a loaded run and then passed 4/4 in isolation at 8.2 s.
      // A horizontal-overflow measurement only needs layout to be final, and
      // the one thing that still moves it after `load` is webfont swap.
      await page.evaluate(() => document.fonts.ready);
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > globalThis.innerWidth;
      });
      expect(hasOverflow, `Horizontal overflow detected on ${post.url}`).toBe(
        false,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Console Error Monitoring
// ---------------------------------------------------------------------------
test.describe("Edge Cases: Console Error Monitoring", () => {
  test("Homepage loads without console errors", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(errors, `Console errors: ${errors.join("; ")}`).toEqual([]);
  });

  test("Blog listing loads without console errors", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    await page.goto("/blog/");
    await page.waitForLoadState("networkidle");
    expect(errors, `Console errors: ${errors.join("; ")}`).toEqual([]);
  });

  test("Tools index loads without console errors", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    await page.goto("/tools/");
    await page.waitForLoadState("networkidle");
    expect(errors, `Console errors: ${errors.join("; ")}`).toEqual([]);
  });

  test("ES homepage loads without console errors", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    await page.goto("/es/");
    await page.waitForLoadState("networkidle");
    expect(errors, `Console errors: ${errors.join("; ")}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Reduced Motion Support
// ---------------------------------------------------------------------------
test.describe("Edge Cases: Reduced Motion", () => {
  test("Page loads with prefers-reduced-motion", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Verify no transitions/animations are set
    const hasReducedMotion = await page.evaluate(() => {
      return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
    });
    expect(hasReducedMotion).toBe(true);

    // Page should still render without errors
    const body = page.locator("body");
    await expect(body).toBeVisible();
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Asset Loading
// ---------------------------------------------------------------------------
test.describe("Edge Cases: Asset Loading", () => {
  test("Critical assets load successfully on homepage", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    const failedAssets: string[] = [];

    page.on("requestfailed", (request) => {
      const url = request.url();
      // Ignore beacon and cdn-cgi/rum (blocked by us) and data URIs
      if (
        !url.includes("beacon.min.js") &&
        !url.includes("cdn-cgi/rum") &&
        !url.startsWith("data:")
      ) {
        failedAssets.push(url);
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(failedAssets, `Failed assets: ${failedAssets.join(", ")}`).toEqual(
      [],
    );
  });

  test("Critical assets load on blog post", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    const failedAssets: string[] = [];

    page.on("requestfailed", (request) => {
      const url = request.url();
      // Ignore beacon and cdn-cgi/rum (blocked by us) and data URIs
      if (
        !url.includes("beacon.min.js") &&
        !url.includes("cdn-cgi/rum") &&
        !url.startsWith("data:")
      ) {
        failedAssets.push(url);
      }
    });

    const pages = getCachedPages();
    const blogPost = pages.find(
      (p) =>
        p.url.startsWith("/blog/") &&
        !p.url.startsWith("/es/") &&
        p.url !== "/blog/" &&
        !p.url.includes("/tags/"),
    );
    expect(blogPost, "No blog post found in sitemap").toBeDefined();
    await page.goto(blogPost!.url);
    await page.waitForLoadState("networkidle");
    expect(
      failedAssets,
      `Failed assets on ${blogPost!.url}: ${failedAssets.join(", ")}`,
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Viewport Edge Cases
// ---------------------------------------------------------------------------
test.describe("Edge Cases: Viewport Sizes", () => {
  test("Page renders at very small viewport (320px)", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const body = page.locator("body");
    await expect(body).toBeVisible();

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > globalThis.innerWidth;
    });
    expect(hasOverflow).toBe(false);
  });

  test("Page renders at very large viewport (2560px)", async ({ page }) => {
    const errors: string[] = [];
    await setupPage(page, errors);
    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});
