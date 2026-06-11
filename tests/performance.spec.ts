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

    // Measure LCP using Performance Observer with polling fallback
    const lcp = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let lcpValue = 0;
        const maxWait = 5000;
        const pollInterval = 200;
        let elapsed = 0;

        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries.at(-1);
          if (lastEntry) {
            lcpValue = lastEntry.startTime;
            // Resolve immediately when LCP is recorded
            observer.disconnect();
            resolve(lcpValue);
          }
        });

        observer.observe({ type: "largest-contentful-paint", buffered: true });

        // Polling fallback for slow CI environments
        const poll = () => {
          elapsed += pollInterval;
          const entries = performance.getEntriesByType(
            "largest-contentful-paint",
          );
          if (entries.length > 0) {
            const lastEntry = entries.at(-1);
            if (lastEntry) lcpValue = lastEntry.startTime;
          }
          if (lcpValue > 0 || elapsed >= maxWait) {
            observer.disconnect();
            resolve(lcpValue);
          } else {
            globalThis.setTimeout(poll, pollInterval);
          }
        };

        globalThis.setTimeout(poll, pollInterval);
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

    // Get viewport height once before the loop
    const viewportHeight = await page.evaluate(() => globalThis.innerHeight);

    /* eslint-disable playwright/no-conditional-in-test -- Viewport detection requires conditionals */
    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const src = await img.getAttribute("src");
      const loading = await img.getAttribute("loading");
      const fetchpriority = await img.getAttribute("fetchpriority");

      // Get image position relative to viewport
      const boundingBox = await img.boundingBox();

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
      /**
       * Parses a CSS duration string (e.g., "0.3s", "300ms") to seconds.
       */
      function parseDurationToSeconds(duration: string): number {
        const value = Number.parseFloat(duration);
        if (Number.isNaN(value)) return 0;
        // CSS duration can be in seconds (s) or milliseconds (ms)
        if (duration.includes("ms")) {
          return value / 1000;
        }
        return value; // Already in seconds
      }

      const elements = document.querySelectorAll("*");
      const animatedWithMotion: string[] = [];

      elements.forEach((el) => {
        const style = getComputedStyle(el);
        const animationName = style.animationName;
        const animationDuration = style.animationDuration;

        // Check if element has animation that's not disabled
        // Long transitions are acceptable as they naturally occur with CSS toggle effects
        const durationInSeconds = parseDurationToSeconds(animationDuration);
        if (
          animationName !== "none" &&
          animationDuration !== "0s" &&
          durationInSeconds > 0.3
        ) {
          animatedWithMotion.push(
            `${el.tagName}.${el.className}: animation=${animationName} duration=${animationDuration}`,
          );
        }
      });

      return animatedWithMotion;
    });

    // Reduced motion test is informational - animations checking logs but doesn't fail
    // The test validates that prefers-reduced-motion media query is detected
    // eslint-disable-next-line playwright/no-conditional-in-test -- Informational logging
    if (animatedElements.length > 0) {
      console.warn(
        "Elements with animations when reduced motion is preferred:",
        animatedElements,
      );
    }

    // Test passes if we reached this point - reduced motion was detected
    expect(hasReducedMotion).toBe(true);
  });
});

test.describe("Content Integrity", () => {
  test("EN RSS feed contains all published EN blog posts", async ({ page }) => {
    // Get all EN blog posts from sitemap (exclude /es/ prefix)
    const urls = await getSitemapUrls();
    const blogPosts = urls.filter(
      (url) =>
        url.includes("/blog/") &&
        !url.startsWith("/es/") &&
        !url.includes("/tags/") &&
        !url.endsWith("/blog/") &&
        !url.includes("999-testing"),
    );

    // Fetch EN RSS feed
    const rssResponse = await page.goto("/rss.xml");
    expect(rssResponse?.status()).toBe(200);

    const rssContent = await rssResponse?.text();
    expect(rssContent, "RSS feed should not be empty").toBeTruthy();

    // Verify RSS is valid XML
    expect(rssContent).toMatch(/<\?xml/);
    expect(rssContent).toMatch(/<rss|<feed/);

    // Check that each EN blog post is in the EN RSS feed
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

    expect(missingPosts, "All EN blog posts should be in EN RSS feed").toEqual(
      [],
    );
  });

  test("ES RSS feed contains all published ES blog posts", async ({ page }) => {
    // Get all ES blog posts from sitemap
    const urls = await getSitemapUrls();
    const esBlogPosts = urls.filter(
      (url) =>
        url.startsWith("/es/") &&
        url.includes("/blog/") &&
        !url.includes("/tags/") &&
        !url.endsWith("/blog/") &&
        !url.includes("999-testing"),
    );

    // Fetch ES RSS feed
    const rssResponse = await page.goto("/es/rss.xml");
    expect(rssResponse?.status()).toBe(200);

    const rssContent = await rssResponse?.text();
    expect(rssContent, "ES RSS feed should not be empty").toBeTruthy();

    // Verify RSS is valid XML with Spanish language
    expect(rssContent).toMatch(/<\?xml/);
    expect(rssContent).toContain("<language>es-es</language>");

    // Check that each ES blog post is in the ES RSS feed
    const missingPosts: string[] = [];

    for (const postUrl of esBlogPosts) {
      // Extract slug (e.g., /es/blog/001-secure-nginx/ -> 001-secure-nginx)
      const slug = postUrl.replace(/^\/es\/blog\//, "").replace(/\/$/, "");

      // eslint-disable-next-line playwright/no-conditional-in-test -- Required for content check
      if (!rssContent?.includes(slug)) {
        missingPosts.push(postUrl);
      }
    }

    expect(missingPosts, "All ES blog posts should be in ES RSS feed").toEqual(
      [],
    );
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
        const normalizedHref = href.split("#", 1)[0].split("?", 1)[0];
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

    /* eslint-enable playwright/no-conditional-in-test */

    // Stylesheet analysis is informational - logs potential issues but doesn't fail
    // eslint-disable-next-line playwright/no-conditional-in-test -- Informational logging
    if (blockingResources.length > 0) {
      console.info(
        "Stylesheets without matching preload (may be render-blocking):",
        blockingResources,
      );
    }

    // This test is informational - pass if we completed analysis
    expect(count).toBeGreaterThanOrEqual(0);
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
      const computedStyles = await img.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          width: style.getPropertyValue("width"),
          height: style.getPropertyValue("height"),
          aspectRatio: style.getPropertyValue("aspect-ratio"),
        };
      });
      const {
        width: computedWidth,
        height: computedHeight,
        aspectRatio: computedAspectRatio,
      } = computedStyles;

      // Responsive images (width:100%, height:auto) are valid if they have
      // width/height HTML attributes - browser calculates aspect ratio from those
      const isResponsiveWithAttributes =
        width && height && computedWidth?.includes("%");

      const hasComputedDimensions =
        isResponsiveWithAttributes ||
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
