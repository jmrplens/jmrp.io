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
  // MCP endpoint stubs in BaseHead: dual-typed ["WebAPI","SoftwareApplication"]
  // references to the canonical entities on mcp.jmrp.io.
  "WebAPI",
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
  "SoftwareSourceCode",
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

        // Robots meta tag should be present. Indexable pages additionally
        // lift the default snippet/preview caps — the site's whole posture is
        // to be quotable, so the conservative defaults work against it. The
        // trailing group is optional because noindex pages omit it, where the
        // directives would be meaningless. Still anchored at both ends so a
        // malformed value cannot slip through.
        const robotsMeta = page.locator('meta[name="robots"]');
        await expect(robotsMeta).toHaveAttribute(
          "content",
          /^(no)?index, (no)?follow(?:, max-snippet:-1, max-image-preview:large, max-video-preview:-1)?$/,
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

  test("ES RSS feed is valid and accessible", async ({ page }) => {
    const response = await page.goto("/es/rss.xml");
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

    // Verify Spanish language tag
    expect(content).toContain("<language>es-es</language>");

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

  /* eslint-disable playwright/no-conditional-in-test -- fence/heading parsing
     needs branching to walk the file line by line */
  test("llms-full.txt nests post/tool body headings below their own title, respecting code fences", async ({
    page,
  }) => {
    // `page.request` performs a plain HTTP fetch decoded as UTF-8, unlike
    // `page.goto()` + `response.text()`, which goes through the browser's
    // network stack and mis-decodes accented characters when the server's
    // `Content-Type` charset gets stripped in preview.
    const response = await page.request.get("/llms-full.txt");
    const content = await response.text();
    expect(content).toBeDefined();

    // Fenced code blocks must be skipped: a leading `#` inside a fence is a
    // shell comment, not a heading, and counting it would corrupt the result.
    let inFence = false;
    const structural: string[] = [];
    for (const line of content.split("\n")) {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const match = /^(#{1,6})\s+(.*)/.exec(line);
      if (match && match[1].length === 2) structural.push(match[2]);
    }

    // Only true document sections may be H2 — post and tool bodies must be
    // demoted below their own title, or H2-boundary chunkers would detach
    // every section from its article.
    expect(structural).toEqual([
      "About the Author",
      "Blog Posts",
      "Blog Posts (Español)",
      "Developer Tools",
      "Developer Tools (Español)",
      "Curriculum Vitae",
      "Publications",
      // Advertised by llms.txt under "## Sections" and previously missing from
      // this document entirely, so a model that followed the index found
      // nothing for four of the sections it had just been promised.
      "Projects",
      "Homelab",
      "Uses",
      "Privacy",
      // Not a page of this site: the author's MCP endpoints live on
      // mcp.jmrp.io. Its own H2 because these are callable endpoints, not
      // prose to read — see mcpBlock() in `@utils/llms`. Both languages in
      // the combined document, like the post/tool sections above.
      "MCP Servers (self-hosted, different domain)",
      "Servidores MCP (autoalojados, en otro dominio)",
      "Contact",
      "Technical Details",
    ]);
  });
  /* eslint-enable playwright/no-conditional-in-test */

  test("llms.txt declares both locales in separate sections", async ({
    page,
  }) => {
    const response = await page.request.get("/llms.txt");
    const content = await response.text();
    expect(content).toBeDefined();

    expect(content).toContain("## Blog Posts (Español)");
    expect(content).toContain("## Developer Tools (Español)");

    // Every post line carries TWO links now — the article and its markdown
    // twin — so the count has to name which one it means or it doubles.
    const esPosts =
      content.match(/]\(https:\/\/jmrp\.io\/es\/blog\/\d{3}-[a-z0-9-]+\/\)/g) ??
      [];
    expect(esPosts).toHaveLength(12);

    const esMarkdown =
      content.match(
        /]\(https:\/\/jmrp\.io\/es\/blog\/\d{3}-[a-z0-9-]+\.md\)/g,
      ) ?? [];
    expect(esMarkdown).toHaveLength(12);
  });

  test("every post has a markdown twin at its own URL", async ({ page }) => {
    for (const path of [
      "/blog/004-enabling-quic-http3-nginx.md",
      "/es/blog/004-enabling-quic-http3-nginx.md",
    ]) {
      const response = await page.request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()["content-type"], path).toContain(
        "text/markdown",
      );

      const body = await response.text();
      // The header is what makes the file usable pasted into a chat with no
      // other context, and the body is what makes it worth pasting.
      expect(body, path).toContain("URL: https://jmrp.io");
      expect(body, path).toContain("Published:");
      // No component tag may survive the conversion.
      expect(body, path).not.toMatch(/<\/?(Callout|Table|Mermaid|Code)\b/);
    }
  });

  test("a post page points at its markdown twin", async ({ page }) => {
    await page.goto("/blog/004-enabling-quic-http3-nginx/");
    const link = page.locator('link[rel="alternate"][type="text/markdown"]');
    await expect(link).toHaveAttribute(
      "href",
      "/blog/004-enabling-quic-http3-nginx.md",
    );
  });

  test("the Spanish corpus reaches its post bodies", async ({ page }) => {
    // This used to assert a post TITLE and call it a body check. It passed for
    // the wrong reason: the string it looked for is the title of post 012, and
    // titles appear in the index links whether or not any body is present — so
    // the assertion survived the bodies moving out to one file per post and
    // guarded nothing.
    const index = await (await page.request.get("/llms-full.txt")).text();
    expect(index).toContain("## Blog Posts (Español)");

    // What llms-full carries now is the LINK to each Spanish body.
    const twin = "/es/blog/012-device-bound-key-derivation.md";
    expect(index).toContain(`https://jmrp.io${twin}`);

    // And the body itself has to be there, at the other end of that link.
    const body = await (await page.request.get(twin)).text();
    expect(body).toContain("# Un PIN de 4 dígitos basta");
    // Prose from deep inside the article, not its title: this is the part a
    // title-matching assertion could never have proven was present.
    expect(body).toContain("PBKDF2");
  });

  test("llms.txt has a single header blockquote, markdown-link contacts, and an Optional section", async ({
    page,
  }) => {
    const response = await page.request.get("/llms.txt");
    const content = await response.text();
    expect(content).toBeDefined();

    // Only the site description remains a blockquote; "Last updated" and the
    // llms-full.txt pointer are now plain lines.
    const blockquotes = content.split("\n").filter((l) => l.startsWith(">"));
    expect(blockquotes).toHaveLength(1);

    // Contacts are markdown links, not "Label: url" plain text.
    expect(content).toMatch(/\[GitHub]\(https:\/\/github\.com\/jmrplens\)/);
    expect(content).toMatch(/\[Email]\(mailto:mail@jmrp\.io\)/);

    // The person entity and both RSS feeds are discoverable from the index.
    // Generated links always point at the production origin (from `SITE`),
    // regardless of which host actually serves this request in tests.
    expect(content).toContain("## Optional");
    expect(content).toContain("https://jmrp.io/identity/person.jsonld");
    expect(content).toContain("https://jmrp.io/rss.xml");
    expect(content).toContain("https://jmrp.io/es/rss.xml");
  });

  test("person entity JSON-LD is linked from the page head", async ({
    page,
  }) => {
    await page.goto("/");
    const link = page.locator(
      'link[rel="alternate"][type="application/ld+json"]',
    );
    await expect(link).toHaveAttribute("href", "/identity/person.jsonld");
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
    const keyPages = ["/cv", "/publications", "/projects"];

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

  test("ai.txt and robots.txt declare the same AI policy", async ({ page }) => {
    // These two files say the same thing in different vocabularies, so they can
    // drift apart silently: robots.txt speaks Content Signals, ai.txt speaks the
    // Spawning dialect. A disagreement between them is worse than having only
    // one, because each is authoritative for a different set of crawlers. This
    // test is the thing that forces them to be edited together.
    const robots = await (await page.goto("/robots.txt"))?.text();
    const ai = await (await page.goto("/ai.txt"))?.text();

    expect(robots).toMatch(
      /Content-Signal:\s*search=yes,\s*ai-input=yes,\s*ai-train=yes/i,
    );

    // ai.txt must grant what robots.txt just promised.
    expect(ai).toMatch(/^User-Agent:\s*\*/im);
    expect(ai).toMatch(/^Allow:\s*\/\s*$/im);
    expect(ai).not.toMatch(/^Disallow:\s*\/\s*$/im);
  });

  test("traffic-advice opts in to prefetch proxies", async ({ page }) => {
    // The file only means anything if `disallow` is false: with `true` we would
    // be turning the Chrome prefetch proxy away, which is the opposite of why
    // it exists here.
    const body = await (await page.goto("/.well-known/traffic-advice"))?.text();
    const advice = JSON.parse(body ?? "[]") as {
      user_agent?: string;
      disallow?: boolean;
    }[];
    const proxy = advice.find((entry) => entry.user_agent === "prefetch-proxy");
    expect(proxy).toBeDefined();
    expect(proxy?.disallow).toBe(false);
  });
});
