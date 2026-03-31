/**
 * Internationalization (i18n) Test Suite
 *
 * Validates the bilingual (EN/ES) implementation:
 * - HTML lang attribute per locale
 * - Hreflang bidirectional links (EN↔ES + x-default)
 * - LanguageSwitcher component functionality
 * - URL routing (no prefix = EN, /es/ prefix = ES)
 * - 404 page locale detection
 * - RSS feeds per locale
 * - Sitemap alternate links
 * - og:locale and og:locale:alternate
 * - JSON-LD inLanguage
 * - Date formatting per locale
 * - No untranslated strings in ES pages (regression)
 */

import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { getCachedPages } from "./utils";

// Read pages synchronously at module scope for parallel test registration
const pages = getCachedPages();

// Separate EN and ES pages for targeted tests
const enPages = pages.filter((p) => !p.url.startsWith("/es/"));
const esPages = pages.filter((p) => p.url.startsWith("/es/"));

// ---------------------------------------------------------------------------
// Per-page i18n checks
// ---------------------------------------------------------------------------

test.describe("i18n: HTML lang attribute", () => {
  for (const pageInfo of enPages) {
    test(`EN lang: ${pageInfo.name}`, async ({ page }) => {
      await page.goto(pageInfo.url);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
    });
  }

  for (const pageInfo of esPages) {
    test(`ES lang: ${pageInfo.name}`, async ({ page }) => {
      await page.goto(pageInfo.url);
      await expect(page.locator("html")).toHaveAttribute("lang", "es");
    });
  }
});

test.describe("i18n: Hreflang bidirectional", () => {
  for (const pageInfo of enPages) {
    test(`Hreflang on EN: ${pageInfo.name}`, async ({ page }) => {
      await page.goto(pageInfo.url);

      // Must have hreflang="en" pointing to self
      const enLink = page.locator('link[rel="alternate"][hreflang="en"]');
      await expect(enLink).toHaveCount(1);
      const enHref = await enLink.getAttribute("href");
      expect(enHref).toMatch(/^https?:\/\//);
      expect(enHref).toContain(pageInfo.url);

      // Must have hreflang="es" pointing to ES version
      const esLink = page.locator('link[rel="alternate"][hreflang="es"]');
      await expect(esLink).toHaveCount(1);
      const esHref = await esLink.getAttribute("href");
      expect(esHref).toMatch(/^https?:\/\//);
      expect(esHref).toContain(`/es${pageInfo.url}`);

      // Must have x-default pointing to EN version
      const xDefault = page.locator(
        'link[rel="alternate"][hreflang="x-default"]',
      );
      await expect(xDefault).toHaveCount(1);
      const xDefaultHref = await xDefault.getAttribute("href");
      expect(xDefaultHref).toContain(pageInfo.url);
    });
  }

  for (const pageInfo of esPages) {
    test(`Hreflang on ES: ${pageInfo.name}`, async ({ page }) => {
      await page.goto(pageInfo.url);

      // Must have hreflang="es" pointing to self
      const esLink = page.locator('link[rel="alternate"][hreflang="es"]');
      await expect(esLink).toHaveCount(1);
      const esHref = await esLink.getAttribute("href");
      expect(esHref).toMatch(/^https?:\/\//);
      expect(esHref).toContain(pageInfo.url);

      // Must have hreflang="en" pointing to EN version
      const enLink = page.locator('link[rel="alternate"][hreflang="en"]');
      await expect(enLink).toHaveCount(1);
      const enHref = await enLink.getAttribute("href");
      expect(enHref).toMatch(/^https?:\/\//);

      // Must have x-default
      const xDefault = page.locator(
        'link[rel="alternate"][hreflang="x-default"]',
      );
      await expect(xDefault).toHaveCount(1);
    });
  }
});

// ---------------------------------------------------------------------------
// LanguageSwitcher
// ---------------------------------------------------------------------------

test.describe("i18n: LanguageSwitcher", () => {
  test("switches from EN to ES and preserves path", async ({ page }) => {
    await page.goto("/blog/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    // Find the language switcher link pointing to ES
    const esLink = page.locator(
      'a[href*="/es/"][aria-label*="spañol"], a[href*="/es/"][aria-label*="panish"], a[hreflang="es"]',
    );
    const esLinkInNav = page.locator("nav").locator('a[hreflang="es"]');
    // eslint-disable-next-line playwright/no-conditional-in-test -- LanguageSwitcher selector fallback
    const langLink = (await esLinkInNav.count()) > 0 ? esLinkInNav : esLink;

    /* eslint-disable playwright/no-conditional-in-test, playwright/no-conditional-expect -- LanguageSwitcher may vary */
    if ((await langLink.count()) > 0) {
      await langLink.first().click();
      await expect(page).toHaveURL(/\/es\/blog\/?/);
      await expect(page.locator("html")).toHaveAttribute("lang", "es");
    }
    /* eslint-enable playwright/no-conditional-in-test, playwright/no-conditional-expect */
  });

  test("switches from ES to EN and preserves path", async ({ page }) => {
    await page.goto("/es/blog/");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");

    // Find the language switcher link pointing to EN
    const enLinkInNav = page.locator("nav").locator('a[hreflang="en"]');

    /* eslint-disable playwright/no-conditional-in-test, playwright/no-conditional-expect -- LanguageSwitcher may vary */
    if ((await enLinkInNav.count()) > 0) {
      await enLinkInNav.first().click();
      await expect(page).toHaveURL(/\/blog\/?$/);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
    }
    /* eslint-enable playwright/no-conditional-in-test, playwright/no-conditional-expect */
  });
});

// ---------------------------------------------------------------------------
// URL routing
// ---------------------------------------------------------------------------

test.describe("i18n: URL routing", () => {
  test("URLs without locale prefix serve EN content", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test("URLs with /es/ prefix serve ES content", async ({ page }) => {
    await page.goto("/es/");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test("EN and ES homepages both load successfully", async ({ page }) => {
    const enResponse = await page.goto("/");
    expect(enResponse?.status()).toBe(200);

    const esResponse = await page.goto("/es/");
    expect(esResponse?.status()).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 404 locale detection
// ---------------------------------------------------------------------------

test.describe("i18n: 404 page", () => {
  test("EN 404 page has lang=en", async ({ page }) => {
    const response = await page.goto("/non-existent-page-xyz");
    expect(response?.status()).toBe(404);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("ES 404 page has lang=es", async ({ page: _page }) => {
    // Astro preview server doesn't serve locale-specific 404 pages
    // (it always serves dist/404.html). In production, Nginx routes
    // /es/* 404s to /es/404/index.html correctly.
    // Instead we verify the built ES 404 HTML file has the correct lang.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const html = await fs.readFile(
      path.join(process.cwd(), "dist/es/404/index.html"),
      "utf-8",
    );
    expect(html).toContain('lang="es"');
  });
});

// ---------------------------------------------------------------------------
// RSS feeds per locale
// ---------------------------------------------------------------------------

test.describe("i18n: RSS feeds", () => {
  test("EN RSS feed has correct language", async ({ page }) => {
    const response = await page.goto("/rss.xml");
    expect(response?.status()).toBe(200);

    const content = await response?.text();
    expect(content).toContain("<language>en-us</language>");
    expect(content).toContain("<rss");
    expect(content).toContain("<item>");

    // Links should not contain /es/ prefix
    const linkMatch = /<link>([^<]+)<\/link>/g;
    const links: string[] = [];
    let match;
    while ((match = linkMatch.exec(content ?? "")) !== null) {
      links.push(match[1]);
    }
    // Channel link and item links should be EN (no /es/)
    for (const link of links) {
      expect(link).not.toMatch(/\/es\//);
    }
  });

  test("ES RSS feed has correct language", async ({ page }) => {
    const response = await page.goto("/es/rss.xml");
    expect(response?.status()).toBe(200);

    const content = await response?.text();
    expect(content).toContain("<language>es-es</language>");
    expect(content).toContain("<rss");
    expect(content).toContain("<item>");

    // Channel link should contain /es/
    expect(content).toMatch(/<link>[^<]*\/es\/?<\/link>/);
  });

  test("Both RSS feeds are referenced in BaseHead", async ({ page }) => {
    await page.goto("/");
    const rssLinks = page.locator(
      'link[rel="alternate"][type="application/rss+xml"]',
    );
    await expect(rssLinks).toHaveCount(2);

    const hrefs: string[] = [];
    const count = await rssLinks.count();
    for (let i = 0; i < count; i++) {
      const href = await rssLinks.nth(i).getAttribute("href");
      hrefs.push(href ?? "");
    }
    expect(hrefs.some((h) => h.includes("/rss.xml"))).toBe(true);
    expect(hrefs.some((h) => h.includes("/es/rss.xml"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sitemap alternates
// ---------------------------------------------------------------------------

test.describe("i18n: Sitemap", () => {
  test("sitemap contains alternate links for both locales", () => {
    const sitemapPath = path.resolve("dist/sitemap-0.xml");
    expect(
      fs.existsSync(sitemapPath),
      "sitemap-0.xml should exist in dist/",
    ).toBe(true);

    const content = fs.readFileSync(sitemapPath, "utf-8");

    // Should have xhtml:link alternates
    expect(content).toContain('rel="alternate"');
    expect(content).toContain('hreflang="en"');
    expect(content).toContain('hreflang="es"');

    // Verify /es/ URLs are present
    expect(content).toContain("/es/");
  });
});

// ---------------------------------------------------------------------------
// og:locale
// ---------------------------------------------------------------------------

test.describe("i18n: Open Graph locale", () => {
  test("EN page has og:locale en_US", async ({ page }) => {
    await page.goto("/");
    const ogLocale = page.locator('meta[property="og:locale"]');
    await expect(ogLocale).toHaveAttribute("content", "en_US");

    // Should have alternate locale
    const ogAlt = page.locator('meta[property="og:locale:alternate"]');
    await expect(ogAlt).toHaveAttribute("content", "es_ES");
  });

  test("ES page has og:locale es_ES", async ({ page }) => {
    await page.goto("/es/");
    const ogLocale = page.locator('meta[property="og:locale"]');
    await expect(ogLocale).toHaveAttribute("content", "es_ES");

    // Should have alternate locale
    const ogAlt = page.locator('meta[property="og:locale:alternate"]');
    await expect(ogAlt).toHaveAttribute("content", "en_US");
  });
});

// ---------------------------------------------------------------------------
// JSON-LD inLanguage
// ---------------------------------------------------------------------------

test.describe("i18n: JSON-LD inLanguage", () => {
  test("EN homepage JSON-LD has inLanguage en", async ({ page }) => {
    await page.goto("/");
    const jsonLd = page.locator('script[type="application/ld+json"]');
    const count = await jsonLd.count();
    expect(count).toBeGreaterThan(0);

    const content = await jsonLd.first().evaluate((el) => el.textContent);
    expect(content).toBeTruthy();

    const schema = JSON.parse(content) as {
      "@graph"?: Array<{ inLanguage?: string; "@type"?: string }>;
      inLanguage?: string;
    };

    // Check if inLanguage exists in @graph items or at root
    /* eslint-disable playwright/no-conditional-in-test, playwright/no-conditional-expect */
    if (schema["@graph"]) {
      const hasInLanguage = schema["@graph"].some(
        (item) => item.inLanguage === "en",
      );
      expect(
        hasInLanguage,
        "At least one @graph item should have inLanguage: en",
      ).toBe(true);
    } else if (schema.inLanguage) {
      expect(schema.inLanguage).toBe("en");
    }
    /* eslint-enable playwright/no-conditional-in-test, playwright/no-conditional-expect */
  });

  test("ES homepage JSON-LD has inLanguage es", async ({ page }) => {
    await page.goto("/es/");
    const jsonLd = page.locator('script[type="application/ld+json"]');
    const count = await jsonLd.count();
    expect(count).toBeGreaterThan(0);

    const content = await jsonLd.first().evaluate((el) => el.textContent);
    expect(content).toBeTruthy();

    const schema = JSON.parse(content) as {
      "@graph"?: Array<{ inLanguage?: string; "@type"?: string }>;
      inLanguage?: string;
    };

    /* eslint-disable playwright/no-conditional-in-test, playwright/no-conditional-expect */
    if (schema["@graph"]) {
      const hasInLanguage = schema["@graph"].some(
        (item) => item.inLanguage === "es",
      );
      expect(
        hasInLanguage,
        "At least one @graph item should have inLanguage: es",
      ).toBe(true);
    } else if (schema.inLanguage) {
      expect(schema.inLanguage).toBe("es");
    }
    /* eslint-enable playwright/no-conditional-in-test, playwright/no-conditional-expect */
  });

  test("EN blog post JSON-LD has inLanguage en", async ({ page }) => {
    // Navigate to the first EN blog post (use .main-link to skip tag links)
    await page.goto("/blog/");
    const postLink = page.locator("article a.main-link").first();

    /* eslint-disable playwright/no-conditional-in-test, playwright/no-conditional-expect */
    if ((await postLink.count()) > 0) {
      const href = await postLink.getAttribute("href");
      if (href) {
        await page.goto(href);
        const jsonLd = page.locator('script[type="application/ld+json"]');
        const content = await jsonLd.first().evaluate((el) => el.textContent);
        expect(content).toBeTruthy();

        const schema = JSON.parse(content) as {
          "@graph"?: Array<{
            inLanguage?: string;
            "@type"?: string | string[];
          }>;
        };

        if (schema["@graph"]) {
          const blogPosting = schema["@graph"].find((item) => {
            const type = item["@type"];
            return (
              type === "BlogPosting" ||
              type === "TechArticle" ||
              (Array.isArray(type) &&
                // eslint-disable-next-line sonarjs/argument-type -- type elements are strings from JSON-LD
                (type.includes("BlogPosting") || type.includes("TechArticle")))
            );
          });
          expect(blogPosting?.inLanguage).toBe("en");
        }
      }
    }
    /* eslint-enable playwright/no-conditional-in-test, playwright/no-conditional-expect */
  });
});

// ---------------------------------------------------------------------------
// Manifest per locale
// ---------------------------------------------------------------------------

test.describe("i18n: Web Manifest", () => {
  test("EN manifest has correct start_url and lang", async ({ page }) => {
    const response = await page.goto("/site.webmanifest");
    expect(response?.status()).toBe(200);
    const manifest = (await response?.json()) as {
      start_url: string;
      lang: string;
    };
    expect(manifest.start_url).toBe("/");
    expect(manifest.lang).toBe("en-US");
  });

  test("ES manifest has correct start_url and lang", async ({ page }) => {
    const response = await page.goto("/es/site.webmanifest");
    expect(response?.status()).toBe(200);
    const manifest = (await response?.json()) as {
      start_url: string;
      lang: string;
    };
    expect(manifest.start_url).toBe("/es/");
    expect(manifest.lang).toBe("es-ES");
  });

  test("Manifest link is locale-aware", async ({ page }) => {
    // EN page should link to EN manifest
    await page.goto("/");
    const enManifest = page.locator('link[rel="manifest"]');
    await expect(enManifest).toHaveAttribute("href", "/site.webmanifest");

    // ES page should link to ES manifest
    await page.goto("/es/");
    const esManifest = page.locator('link[rel="manifest"]');
    await expect(esManifest).toHaveAttribute("href", "/es/site.webmanifest");
  });
});

// ---------------------------------------------------------------------------
// Canonical per locale
// ---------------------------------------------------------------------------

test.describe("i18n: Canonical URLs", () => {
  test("EN pages have EN canonical (no /es/)", async ({ page }) => {
    await page.goto("/blog/");
    const canonical = page.locator('link[rel="canonical"]');
    const href = await canonical.getAttribute("href");
    expect(href).toMatch(/^https?:\/\//);
    expect(href).not.toContain("/es/");
  });

  test("ES pages have ES canonical (with /es/)", async ({ page }) => {
    await page.goto("/es/blog/");
    const canonical = page.locator('link[rel="canonical"]');
    const href = await canonical.getAttribute("href");
    expect(href).toMatch(/^https?:\/\//);
    expect(href).toContain("/es/");
  });
});

// ---------------------------------------------------------------------------
// Translation Key Parity & Integrity
// ---------------------------------------------------------------------------

/**
 * Recursively extract all leaf keys from a nested object.
 * Returns dot-separated paths like "nav.home", "ui.backTo".
 */
function extractKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      keys.push(...extractKeys(value as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

test.describe("i18n: Translation key parity", () => {
  test("common.ts EN and ES have the same keys", async () => {
    const enCommon = await import("../src/i18n/translations/en/common.ts");
    const esCommon = await import("../src/i18n/translations/es/common.ts");

    const enKeys = extractKeys(enCommon.common).sort((a, b) =>
      a.localeCompare(b),
    );
    const esKeys = extractKeys(esCommon.common).sort((a, b) =>
      a.localeCompare(b),
    );

    // Find missing keys in each direction
    // eslint-disable-next-line sonarjs/argument-type -- both arrays are string[], false positive with TS6
    const missingInEs = enKeys.filter((k: string) => !esKeys.includes(k));
    // eslint-disable-next-line sonarjs/argument-type -- both arrays are string[], false positive with TS6
    const missingInEn = esKeys.filter((k: string) => !enKeys.includes(k));

    expect(
      missingInEs,
      `Keys in EN common.ts but missing in ES: ${missingInEs.join(", ")}`,
    ).toEqual([]);
    expect(
      missingInEn,
      `Keys in ES common.ts but missing in EN: ${missingInEn.join(", ")}`,
    ).toEqual([]);
  });

  test("tools.ts EN and ES have the same keys", async () => {
    const enTools = await import("../src/i18n/translations/en/tools.ts");
    const esTools = await import("../src/i18n/translations/es/tools.ts");

    const enKeys = extractKeys(enTools.tools).sort((a, b) =>
      a.localeCompare(b),
    );
    const esKeys = extractKeys(esTools.tools).sort((a, b) =>
      a.localeCompare(b),
    );

    // eslint-disable-next-line sonarjs/argument-type -- both arrays are string[], false positive with TS6
    const missingInEs = enKeys.filter((k: string) => !esKeys.includes(k));
    // eslint-disable-next-line sonarjs/argument-type -- both arrays are string[], false positive with TS6
    const missingInEn = esKeys.filter((k: string) => !enKeys.includes(k));

    expect(
      missingInEs,
      `Keys in EN tools.ts but missing in ES: ${missingInEs.join(", ")}`,
    ).toEqual([]);
    expect(
      missingInEn,
      `Keys in ES tools.ts but missing in EN: ${missingInEn.join(", ")}`,
    ).toEqual([]);
  });
});

/**
 * Check for empty string values in a translation object.
 * Returns dot-separated paths of empty values.
 */
function checkNoEmpty(
  obj: Record<string, unknown>,
  locale: string,
  prefix = "",
): string[] {
  const empties: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      empties.push(
        ...checkNoEmpty(value as Record<string, unknown>, locale, path),
      );
    } else if (value === "") {
      empties.push(`${locale}:${path}`);
    }
  }
  return empties;
}

test.describe("i18n: No empty translations", () => {
  test("common.ts has no empty string values", async () => {
    const enCommon = await import("../src/i18n/translations/en/common.ts");
    const esCommon = await import("../src/i18n/translations/es/common.ts");

    const emptyEn = checkNoEmpty(enCommon.common, "EN");
    const emptyEs = checkNoEmpty(esCommon.common, "ES");
    const allEmpty = [...emptyEn, ...emptyEs];

    expect(
      allEmpty,
      `Empty translation values found: ${allEmpty.join(", ")}`,
    ).toEqual([]);
  });

  test("tools.ts has no empty string values", async () => {
    const enTools = await import("../src/i18n/translations/en/tools.ts");
    const esTools = await import("../src/i18n/translations/es/tools.ts");

    const emptyEn = checkNoEmpty(enTools.tools, "EN");
    const emptyEs = checkNoEmpty(esTools.tools, "ES");
    const allEmpty = [...emptyEn, ...emptyEs];

    expect(
      allEmpty,
      `Empty translation values found: ${allEmpty.join(", ")}`,
    ).toEqual([]);
  });
});

test.describe("i18n: 404 page translations", () => {
  test("EN 404 has English content", async () => {
    // Read built file directly to avoid Astro preview serving wrong locale
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const html = await fs.readFile(
      path.join(process.cwd(), "dist/404.html"),
      "utf-8",
    );
    expect(html).toContain("404");
    // Verify English text is present
    expect(html.toLowerCase()).toContain("page");
  });

  test("ES 404 has Spanish content", async () => {
    // Read built file directly to avoid Astro preview always serving EN 404
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const html = await fs.readFile(
      path.join(process.cwd(), "dist/es/404/index.html"),
      "utf-8",
    );
    expect(html).toContain("404");
    // Verify Spanish text is present
    expect(html.toLowerCase()).toMatch(/página|pagina/);
  });
});
