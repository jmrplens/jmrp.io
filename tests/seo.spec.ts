/**
 * SEO & Metadata Test Suite
 *
 * Validates search engine optimization and social sharing requirements:
 * - Technical SEO files (robots.txt, sitemap)
 * - Page titles (length)
 * - Canonical URLs
 * - Meta descriptions
 * - Open Graph tags (og:title, og:description, og:image, og:url)
 * - Twitter Card meta tags
 * - Structured data (JSON-LD)
 * - Language attributes
 * - 404 page metadata
 *
 * Per-page tests run in parallel across workers for maximum performance.
 * Dynamically tests all pages discovered from the sitemap.
 */

import { expect, test } from "@playwright/test";

import { getCachedPages } from "./utils";

/** JSON-LD schema structure for validation */
interface JsonLdSchema {
  "@type"?: string | string[];
  "@context"?: string;
  "@graph"?: JsonLdSchema[];
  [key: string]: unknown;
}

/** Valid Schema.org types for this site */
const VALID_SCHEMA_TYPES = [
  "Organization",
  "Person",
  "Article",
  "BlogPosting",
  "WebSite",
  "WebPage",
  "BreadcrumbList",
  "ImageObject",
  "TechArticle",
  "HowTo",
  "FAQPage",
  "ItemList",
  "SiteNavigationElement",
  "ListItem",
  "CollectionPage",
  "ProfilePage",
  "ScholarlyArticle",
  "Periodical",
  "EducationalOrganization",
  "Occupation",
  "EducationalOccupationalCredential",
  "SoftwareApplication",
  "Offer",
  "Service",
] as const;

/**
 * Validates that all schema types are in the valid types list.
 *
 * @param schemaType - Single type or array of types from @type
 * @param validTypes - Array of valid Schema.org types
 */
function validateSchemaTypes(
  schemaType: string | string[],
  validTypes: readonly string[],
): void {
  const types = Array.isArray(schemaType) ? schemaType : [schemaType];
  for (const type of types) {
    expect(validTypes, `Unknown Schema.org type: ${type}`).toContain(type);
  }
}

/**
 * Validates a JSON-LD script content is parseable and has a valid @type
 * @param jsonLdContent - The text content of a JSON-LD script
 * @param validTypes - Array of valid Schema.org types to check against
 */
function validateJsonLd(
  jsonLdContent: string,
  validTypes: readonly string[],
): void {
  // Parse once - if parsing fails, this will throw and fail the test
  const schema = JSON.parse(jsonLdContent) as JsonLdSchema;

  // Handle @graph container (multiple schemas in one script)
  if (schema["@graph"] && Array.isArray(schema["@graph"])) {
    for (const graphItem of schema["@graph"]) {
      // Enforce @type for all @graph items consistently with single schema
      expect(
        graphItem["@type"],
        "JSON-LD @graph item should have @type",
      ).toBeDefined();
      validateSchemaTypes(graphItem["@type"]!, validTypes);
    }
    return;
  }

  // Standard single schema - must have @type
  expect(schema["@type"], "JSON-LD should have @type").toBeDefined();
  validateSchemaTypes(schema["@type"]!, validTypes);
}

// Read pages synchronously at module scope for parallel test registration
const pages = getCachedPages();

test.describe("SEO Per-Page Checks", () => {
  for (const pageInfo of pages) {
    test(`SEO: ${pageInfo.name}`, async ({ page }) => {
      await page.goto(pageInfo.url);

      // --- Page Metadata ---
      await test.step("Page metadata", async () => {
        const title = await page.title();
        expect(title.length).toBeGreaterThan(0);
        expect(title.length).toBeLessThan(70);

        const canonical = page.locator('link[rel="canonical"]');
        await expect(canonical).toHaveAttribute("href", /^https?:\/\//);

        const description = page.locator('meta[name="description"]');
        await expect(description).toHaveAttribute("content", /.{10,}/);

        // Meta description should not exceed 160 chars (Google truncation)
        const descContent = await description.getAttribute("content");
        expect(
          descContent!.length,
          `Description too long (${descContent!.length} chars): ${descContent!.substring(0, 50)}...`,
        ).toBeLessThanOrEqual(160);

        // Robots meta tag should be present
        const robotsMeta = page.locator('meta[name="robots"]');
        await expect(robotsMeta).toHaveAttribute(
          "content",
          /^(no)?index, (no)?follow$/,
        );

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

        // og:type should be present with a valid value
        await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
          "content",
          /^(website|article|profile)$/,
        );

        // og:image:alt for accessibility
        await expect(
          page.locator('meta[property="og:image:alt"]'),
        ).toHaveAttribute("content", /.+/);
      });

      // --- Twitter Card ---
      /* eslint-disable playwright/no-conditional-in-test -- Twitter card presence is optional */
      await test.step("Twitter Card meta tags", async () => {
        const twitterCard = page.locator('meta[name="twitter:card"]');
        const hasTwitterCard = (await twitterCard.count()) > 0;

        if (hasTwitterCard) {
          // eslint-disable-next-line playwright/no-conditional-expect
          await expect(twitterCard).toHaveAttribute(
            "content",
            /summary|summary_large_image|player|app/,
          );
        }

        const socialTitle = page.locator(
          'meta[name="twitter:title"], meta[property="og:title"]',
        );
        await expect(socialTitle.first()).toHaveAttribute("content", /.+/);

        const socialDesc = page.locator(
          'meta[name="twitter:description"], meta[property="og:description"]',
        );
        await expect(socialDesc.first()).toHaveAttribute("content", /.+/);

        // twitter:image:alt for accessibility
        const twitterImageAlt = page.locator('meta[name="twitter:image:alt"]');
        const hasTwitterImageAlt = (await twitterImageAlt.count()) > 0;
        if (hasTwitterImageAlt) {
          // eslint-disable-next-line playwright/no-conditional-expect
          await expect(twitterImageAlt).toHaveAttribute("content", /.+/);
        }
      });
      /* eslint-enable playwright/no-conditional-in-test */

      // --- Language attribute ---
      await test.step("HTML language attribute", async () => {
        const html = page.locator("html");
        await expect(html).toHaveAttribute(
          "lang",
          /^[a-z]{2,3}(?:-[a-z0-9]+)*$/i,
        );
      });
    });
  }
});

test.describe("SEO & Metadata Checks", () => {
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

    // 404 pages must not be indexed by search engines
    const robotsMeta = page.locator('meta[name="robots"]');
    await expect(robotsMeta).toHaveAttribute("content", /noindex/);
  });

  test("RSS feed is valid and accessible", async ({ page }) => {
    const response = await page.goto("/rss.xml");
    expect(response?.status()).toBe(200);

    const content = await response?.text();
    expect(content).toBeDefined();

    // Verify RSS structure
    expect(content).toContain("<rss");
    expect(content).toContain("<channel>");
    expect(content).toContain("<title>");
    expect(content).toContain("<link>");
    expect(content).toContain("<description>");
    expect(content).toContain("<item>");

    // Verify channel has image element
    expect(content).toContain("<image>");

    // Verify Atom self-link for feed readers
    expect(content).toContain('rel="self"');
  });

  test("llms.txt exists and has valid structure", async ({ page }) => {
    const response = await page.goto("/llms.txt");
    expect(response?.status()).toBe(200);

    const content = await response?.text();
    expect(content).toBeDefined();

    // Verify llms.txt has key sections
    expect(content).toContain("# ");
    expect(content).toContain("> ");

    // Verify llms-full.txt reference
    expect(content).toContain("llms-full.txt");
  });

  test("llms-full.txt exists and has detailed content", async ({ page }) => {
    const response = await page.goto("/llms-full.txt");
    expect(response?.status()).toBe(200);

    const content = await response?.text();
    expect(content).toBeDefined();

    // Verify comprehensive structure
    expect(content).toContain("## Blog Posts");
    expect(content).toContain("## Developer Tools");
    expect(content).toContain("## Contact");
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

    // Validate each JSON-LD script is parseable and has valid @type
    for (let i = 0; i < homepageJsonLdCount; i++) {
      const jsonLdContent = await homepageJsonLdScripts.nth(i).textContent();
      // eslint-disable-next-line playwright/no-conditional-in-test
      if (jsonLdContent) {
        validateJsonLd(jsonLdContent, VALID_SCHEMA_TYPES);
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

        // Validate JSON-LD is valid JSON with proper @type
        const jsonLdContent = await page
          .locator('script[type="application/ld+json"]')
          .first()
          .textContent();
        // eslint-disable-next-line playwright/no-conditional-in-test
        if (jsonLdContent) {
          // Use VALID_SCHEMA_TYPES because blog posts use @graph with multiple types
          validateJsonLd(jsonLdContent, VALID_SCHEMA_TYPES);
        }
      }
    }
  });

  test("JSON-LD schema on secondary pages", async ({ page }) => {
    // Verify structured data exists on all key section pages
    const keyPages = ["/cv", "/publications", "/github"];

    for (const pageUrl of keyPages) {
      await page.goto(pageUrl);
      const jsonLdScripts = page.locator('script[type="application/ld+json"]');
      const count = await jsonLdScripts.count();
      expect(
        count,
        `${pageUrl} should have JSON-LD structured data`,
      ).toBeGreaterThan(0);

      // Validate all schemas on this page
      for (let i = 0; i < count; i++) {
        const content = await jsonLdScripts.nth(i).textContent();
        // eslint-disable-next-line playwright/no-conditional-in-test
        if (content) {
          validateJsonLd(content, VALID_SCHEMA_TYPES);
        }
      }
    }
  });

  test("robots.txt has comprehensive bot directives", async ({ page }) => {
    const response = await page.goto("/robots.txt");
    const content = await response?.text();
    expect(content).toBeDefined();

    // Verify essential search engine bots are addressed
    expect(content).toContain("Googlebot");
    expect(content).toContain("Bingbot");

    // Verify sitemap reference
    expect(content).toMatch(/Sitemap:\s*https?:\/\//i);

    // Verify AI bot directives exist
    expect(content).toContain("GPTBot");
    expect(content).toContain("ClaudeBot");
  });
});
