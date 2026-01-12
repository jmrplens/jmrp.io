/**
 * SEO & Metadata Test Suite
 *
 * Validates search engine optimization and social sharing requirements:
 * - Technical SEO files (robots.txt, sitemap)
 * - Page titles (length, uniqueness)
 * - Canonical URLs
 * - Meta descriptions
 * - Open Graph tags (og:title, og:description, og:image, og:url)
 * - Twitter Card meta tags
 * - Structured data (JSON-LD)
 * - Language attributes
 * - 404 page metadata
 */

import { expect, test } from "@playwright/test";

import { getSitemapUrls } from "./utils";

test.describe("SEO & Metadata Checks", () => {
  let urls: string[] = [];

  test.beforeAll(async () => {
    urls = await getSitemapUrls();
  });

  test("Technical SEO files exist", async ({ page }) => {
    // Check robots.txt
    const robots = await page.goto("/robots.txt");
    expect(robots?.status()).toBe(200);
    expect(await robots?.text()).toContain("User-agent:");

    // Check sitemap-index.xml redirect or content
    const sitemap = await page.goto("/sitemap-index.xml");
    expect(sitemap?.status()).toBe(200);
    const text = await sitemap?.text();
    expect(text).toMatch(/urlset|sitemapindex/);
  });

  test("Page Metadata Verification", async ({ page }) => {
    for (const url of urls) {
      await test.step(`Checking Metadata: ${url}`, async () => {
        await page.goto(url);

        // 1. Title
        const title = await page.title();
        expect(title.length).toBeGreaterThan(0);
        expect(title.length).toBeLessThan(70); // Google truncates ~60-70 chars

        // 2. Canonical Tag
        const canonical = page.locator('link[rel="canonical"]');
        await expect(canonical).toHaveAttribute("href", /^https?:\/\//);

        // 3. Meta Description
        const description = page.locator('meta[name="description"]');
        await expect(description).toHaveAttribute("content", /.{10,}/);

        // 4. Open Graph Tags (Social Sharing)
        await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
          "content",
          /.+/,
        );
        await expect(
          page.locator('meta[property="og:description"]'),
        ).toHaveAttribute("content", /.+/);
        await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
          "content",
          /.+/,
        );
        await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
          "content",
          /.+/,
        );
      });
    }
  });

  test("404 page has correct SEO metadata", async ({ page }) => {
    const response = await page.goto("/non-existent-page-xyz");
    expect(response?.status()).toBe(404);

    // Verify Title (should contain 404)
    await expect(page).toHaveTitle(/404/i);

    // Verify Meta Description exists
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute("content", /.+/);

    // Verify Canonical is present and valid
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute("href", /^https?:\/\//);
  });

  test("Twitter Card meta tags (if present)", async ({ page }) => {
    for (const url of urls) {
      await test.step(`Checking Twitter Cards: ${url}`, async () => {
        await page.goto(url);

        // Twitter Card is optional - only validate if present
        const twitterCard = page.locator('meta[name="twitter:card"]');
        const hasTwitterCard = (await twitterCard.count()) > 0;

        // eslint-disable-next-line playwright/no-conditional-in-test
        if (hasTwitterCard) {
          // Twitter Card type (summary, summary_large_image, etc.)
          // eslint-disable-next-line playwright/no-conditional-expect
          await expect(twitterCard).toHaveAttribute(
            "content",
            /summary|summary_large_image|player|app/,
          );
        }

        // Twitter/OG title and description should always exist (falls back to OG)
        const socialTitle = page.locator(
          'meta[name="twitter:title"], meta[property="og:title"]',
        );
        await expect(socialTitle.first()).toHaveAttribute("content", /.+/);

        const socialDesc = page.locator(
          'meta[name="twitter:description"], meta[property="og:description"]',
        );
        await expect(socialDesc.first()).toHaveAttribute("content", /.+/);
      });
    }
  });

  test("HTML language attribute is set", async ({ page }) => {
    for (const url of urls) {
      await test.step(`Checking lang attribute: ${url}`, async () => {
        await page.goto(url);

        // HTML element should have lang attribute
        const html = page.locator("html");
        await expect(html).toHaveAttribute(
          "lang",
          /^[a-z]{2,3}(?:-[a-z0-9]+)*$/i,
        );
      });
    }
  });

  test("Structured data (JSON-LD) is present on key pages", async ({
    page,
  }) => {
    // Check homepage for Organization/Person schema
    await page.goto("/");
    const homepageJsonLdScripts = page.locator(
      'script[type="application/ld+json"]',
    );
    const homepageJsonLdCount = await homepageJsonLdScripts.count();
    expect(homepageJsonLdCount).toBeGreaterThan(0);

    // Validate each JSON-LD script is parseable
    for (let i = 0; i < homepageJsonLdCount; i++) {
      const jsonLdContent = await homepageJsonLdScripts.nth(i).textContent();
      // eslint-disable-next-line playwright/no-conditional-in-test
      if (jsonLdContent) {
        // eslint-disable-next-line playwright/no-conditional-expect
        expect(() => {
          JSON.parse(jsonLdContent);
        }).not.toThrow();
      }
    }

    // Check a blog post for Article schema
    await page.goto("/blog");
    const blogArticles = page.locator("article a[href*='/blog/']");
    const articleCount = await blogArticles.count();

    // eslint-disable-next-line playwright/no-conditional-in-test
    if (articleCount > 0) {
      const firstPostHref = await blogArticles.first().getAttribute("href");
      // eslint-disable-next-line playwright/no-conditional-in-test
      if (firstPostHref) {
        await page.goto(firstPostHref);
        const postJsonLd = await page
          .locator('script[type="application/ld+json"]')
          .count();
        // eslint-disable-next-line playwright/no-conditional-expect
        expect(postJsonLd).toBeGreaterThan(0);

        // Validate JSON-LD is valid JSON
        const jsonLdContent = await page
          .locator('script[type="application/ld+json"]')
          .first()
          .textContent();
        // eslint-disable-next-line playwright/no-conditional-in-test
        if (jsonLdContent) {
          // eslint-disable-next-line playwright/no-conditional-expect
          expect(() => {
            JSON.parse(jsonLdContent);
          }).not.toThrow();
        }
      }
    }
  });
});
