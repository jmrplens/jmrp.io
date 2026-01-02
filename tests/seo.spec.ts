import { test, expect } from "@playwright/test";
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

    // Check sitemap.xml redirect or content
    const sitemap = await page.goto("/sitemap.xml");
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
        expect(title).toBeTruthy();
        expect(title.length).toBeGreaterThan(0);
        expect(title.length).toBeLessThan(70); // Google truncates ~60-70 chars

        // 2. Canonical Tag
        const canonical = await page
          .locator('link[rel="canonical"]')
          .getAttribute("href");
        expect(canonical).toBeTruthy();
        // Canonical should probably match the current URL (absolute)
        // Adjust logic if you have specific canonical rules
        // const currentUrl = page.url();
        // Simple check: Canonical should be a valid URL
        expect(canonical).toMatch(/^https?:\/\//);

        // 3. Meta Description
        const description = await page
          .locator('meta[name="description"]')
          .getAttribute("content");
        expect(description).toBeTruthy();
        expect(description?.length).toBeGreaterThan(10); // Minimum length check

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
});
