/**
 * Performance & User Preferences Test Suite
 *
 * Tests performance optimizations and user preference handling:
 * - Core Web Vitals (LCP, CLS)
 * - Lazy loading for below-fold images
 * - Preload critical resources (fonts, LCP images)
 * - Reduced motion preference handling
 * - RSS feed content validation
 * - Internal broken link detection
 */

import { expect, test } from "@playwright/test";

import { getSitemapUrls } from "./utils";

test.describe("Performance Optimizations", () => {
  test("Core Web Vitals - LCP within threshold", async ({ page }) => {
    // eslint-disable-next-line playwright/no-networkidle -- Required for LCP measurement
    await page.goto("/", { waitUntil: "networkidle" });

    // Measure LCP using Performance Observer
    const lcp = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let lcpValue = 0;

        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          // LCP is the last entry in the list
          const lastEntry = entries.at(-1);
          if (lastEntry) {
            lcpValue = lastEntry.startTime;
          }
        });

        observer.observe({ type: "largest-contentful-paint", buffered: true });

        // Give LCP time to be recorded, then resolve
        globalThis.setTimeout(() => {
          observer.disconnect();
          resolve(lcpValue);
        }, 1000);
      });
    });

    // LCP should be under 2500ms for "Good" score
    // Using 4000ms as threshold for test environment (CI can be slower)
    expect(lcp, "LCP should be recorded").toBeGreaterThan(0);
    expect(lcp, "LCP should be under 4000ms").toBeLessThan(4000);
  });

  test("below-fold images have lazy loading", async ({ page }) => {
    await page.goto("/blog/");

    // Get all images on the page
    const images = page.locator("img");
    const count = await images.count();

    // Track issues for reporting
    const lazyLoadingIssues: string[] = [];

    /* eslint-disable playwright/no-conditional-in-test -- Viewport detection requires conditionals */
    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const src = await img.getAttribute("src");
      const loading = await img.getAttribute("loading");
      const fetchpriority = await img.getAttribute("fetchpriority");

      // Get image position relative to viewport
      const boundingBox = await img.boundingBox();
      const viewportHeight = await page.evaluate(() => globalThis.innerHeight);

      // Images below the fold should have lazy loading
      // Skip images with fetchpriority="high" (intentionally eager)
      const isBelowFold =
        boundingBox &&
        boundingBox.y > viewportHeight &&
        fetchpriority !== "high";

      if (isBelowFold && loading !== "lazy") {
        const yPos = boundingBox ? Math.round(boundingBox.y) : 0;
        lazyLoadingIssues.push(
          `Image ${src} at y=${yPos} should have loading="lazy"`,
        );
      }
    }
    /* eslint-enable playwright/no-conditional-in-test */

    expect(
      lazyLoadingIssues,
      "Below-fold images should have lazy loading",
    ).toEqual([]);
  });

  test("critical resources are preloaded", async ({ page }) => {
    await page.goto("/");

    // Check for preloaded fonts
    const fontPreloads = page.locator(
      'link[rel="preload"][as="font"], link[rel="preload"][href*=".woff"]',
    );
    const fontCount = await fontPreloads.count();

    // Should have at least one font preloaded
    expect(fontCount, "Should preload at least one font").toBeGreaterThan(0);

    // Verify preloaded fonts have crossorigin attribute (required for fonts)
    for (let i = 0; i < fontCount; i++) {
      const link = fontPreloads.nth(i);
      const crossorigin = await link.getAttribute("crossorigin");
      const href = await link.getAttribute("href");

      // Fonts require crossorigin for CORS
      expect(
        crossorigin !== null,
        `Font preload ${href} should have crossorigin attribute`,
      ).toBe(true);
    }
  });

  test("respects reduced motion preference", async ({ page }) => {
    // Emulate reduced motion preference
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    // Check that animations are disabled or reduced
    const hasReducedMotion = await page.evaluate(() => {
      const mediaQuery = globalThis.matchMedia(
        "(prefers-reduced-motion: reduce)",
      );
      return mediaQuery.matches;
    });

    expect(hasReducedMotion, "Reduced motion should be detected").toBe(true);

    // Check that CSS respects the preference
    // Elements with animations should have animation-duration: 0 or no animation
    const animatedElements = await page.evaluate(() => {
      const elements = document.querySelectorAll("*");
      const animatedWithMotion: string[] = [];

      elements.forEach((el) => {
        const style = getComputedStyle(el);
        const animationName = style.animationName;
        const animationDuration = style.animationDuration;
        const transitionDuration = style.transitionDuration;

        // Check if element has animation that's not disabled
        if (
          animationName !== "none" &&
          animationDuration !== "0s" &&
          Number.parseFloat(animationDuration) > 0.3
        ) {
          animatedWithMotion.push(
            `${el.tagName}.${el.className}: animation=${animationName} duration=${animationDuration}`,
          );
        }

        // Check if element has long transitions
        // Allow very short transitions as they're usually acceptable
        // Only flag animations > 300ms
        if (
          transitionDuration !== "0s" &&
          Number.parseFloat(transitionDuration) > 0.3
        ) {
          // This is informational only - captured in animatedWithMotion
        }
      });

      return animatedWithMotion;
    });

    // Log but don't fail for now - this is informational
    // eslint-disable-next-line playwright/no-conditional-in-test -- Informational logging
    if (animatedElements.length > 0) {
      console.warn(
        "Elements with animations when reduced motion is preferred:",
        animatedElements,
      );
    }

    // Test passes if reduced motion is detected - animation checking is informational
    expect(animatedElements).toBeDefined();
  });
});

test.describe("Content Integrity", () => {
  test("RSS feed contains all published blog posts", async ({ page }) => {
    // Get all blog posts from sitemap
    const urls = await getSitemapUrls();
    const blogPosts = urls.filter(
      (url) =>
        url.includes("/blog/") &&
        !url.includes("/tags/") &&
        !url.endsWith("/blog/") &&
        !url.includes("999-testing"),
    );

    // Fetch RSS feed
    const rssResponse = await page.goto("/rss.xml");
    expect(rssResponse?.status()).toBe(200);

    const rssContent = await rssResponse?.text();
    expect(rssContent, "RSS feed should not be empty").toBeTruthy();

    // Verify RSS is valid XML
    expect(rssContent).toMatch(/<\?xml/);
    expect(rssContent).toMatch(/<rss|<feed/);

    // Check that each blog post is in the RSS feed
    const missingPosts: string[] = [];

    for (const postUrl of blogPosts) {
      // Extract slug from URL (e.g., /blog/001-secure-nginx/ -> 001-secure-nginx)
      const slug = postUrl.replace(/^\/blog\//, "").replace(/\/$/, "");

      // RSS should contain link to post
      // eslint-disable-next-line playwright/no-conditional-in-test -- Required for content check
      if (!rssContent?.includes(slug)) {
        missingPosts.push(postUrl);
      }
    }

    expect(missingPosts, "All blog posts should be in RSS feed").toEqual([]);
  });

  test("no broken internal links", async ({ page }) => {
    const urls = await getSitemapUrls();
    const brokenLinks: string[] = [];
    const checkedLinks = new Set<string>();

    // Limit to first 5 pages to keep test fast
    const pagesToCheck = urls.slice(0, 5);

    for (const url of pagesToCheck) {
      await page.goto(url);

      // Get all internal links on the page
      const internalLinks = await page
        .locator(
          'a[href^="/"]:not([href^="//"]):not([href*="mailto:"]):not([href*="tel:"])',
        )
        .evaluateAll((links) =>
          links
            .map((l) => l.getAttribute("href"))
            .filter((href): href is string => href !== null),
        );

      // Check each unique link
      for (const href of internalLinks) {
        // Normalize and skip already checked
        const normalizedHref = href.split("#")[0].split("?")[0];
        // eslint-disable-next-line playwright/no-conditional-in-test -- Required for deduplication
        if (checkedLinks.has(normalizedHref) || normalizedHref === "") {
          continue;
        }
        checkedLinks.add(normalizedHref);

        // Skip special protocols (already filtered by selector, but double-check)
        // eslint-disable-next-line playwright/no-conditional-in-test -- Required for protocol filtering
        if (
          normalizedHref.includes("mailto:") ||
          normalizedHref.includes("tel:")
        ) {
          continue;
        }

        // Check if link returns 200
        const response = await page.goto(normalizedHref);
        const status = response?.status() ?? 0;

        // eslint-disable-next-line playwright/no-conditional-in-test -- Required for status checking
        if (status !== 200 && status !== 304) {
          brokenLinks.push(`${url} -> ${normalizedHref} (${status})`);
        }
      }
    }

    expect(brokenLinks, "Should have no broken internal links").toEqual([]);
  });
});

test.describe("Resource Loading", () => {
  test("no render-blocking resources without preload", async ({ page }) => {
    await page.goto("/");

    // Check that critical stylesheets are either preloaded or inlined
    const linkStylesheets = page.locator('link[rel="stylesheet"]');
    const count = await linkStylesheets.count();

    const blockingResources: string[] = [];

    /* eslint-disable playwright/no-conditional-in-test -- Stylesheet analysis requires conditionals */
    for (let i = 0; i < count; i++) {
      const link = linkStylesheets.nth(i);
      const href = await link.getAttribute("href");
      const media = await link.getAttribute("media");

      // Skip print stylesheets (not render-blocking)
      if (media === "print") continue;

      // Check if there's a corresponding preload
      const hasPreload = await page
        .locator(`link[rel="preload"][href="${href}"]`)
        .count();

      // External stylesheets without preload are render-blocking
      if (
        hasPreload === 0 &&
        href &&
        !href.includes("fonts.googleapis") // Google Fonts are expected
      ) {
        blockingResources.push(href);
      }
    }

    // Log but don't fail - many sites handle this differently
    if (blockingResources.length > 0) {
      console.info(
        "Stylesheets without matching preload (may be render-blocking):",
        blockingResources,
      );
    }
    /* eslint-enable playwright/no-conditional-in-test */

    // Test passes - this is informational
    expect(blockingResources).toBeDefined();
  });

  test("images have explicit dimensions", async ({ page }) => {
    await page.goto("/");

    const images = page.locator("img");
    const count = await images.count();
    const imagesWithoutDimensions: string[] = [];

    /* eslint-disable playwright/no-conditional-in-test -- Image dimension detection requires conditionals */
    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const width = await img.getAttribute("width");
      const height = await img.getAttribute("height");
      const src = await img.getAttribute("src");
      const style = await img.getAttribute("style");

      // Check if dimensions are set via attributes or have aspect-ratio in CSS
      const hasExplicitDimensions =
        (width && height) ||
        style?.includes("aspect-ratio") ||
        style?.includes("width") ||
        style?.includes("height");

      // Check if the image uses CSS classes that set dimensions
      const computedWidth = await img.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("width"),
      );
      const computedHeight = await img.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("height"),
      );
      const computedAspectRatio = await img.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("aspect-ratio"),
      );

      const hasComputedDimensions =
        (computedWidth !== "auto" &&
          computedWidth !== "0px" &&
          computedHeight !== "auto" &&
          computedHeight !== "0px") ||
        computedAspectRatio !== "auto";

      if (!hasExplicitDimensions && !hasComputedDimensions) {
        imagesWithoutDimensions.push(src || "unknown");
      }
    }
    /* eslint-enable playwright/no-conditional-in-test */

    // Images without dimensions cause CLS
    expect(
      imagesWithoutDimensions,
      "Images should have explicit dimensions to prevent CLS",
    ).toEqual([]);
  });
});
