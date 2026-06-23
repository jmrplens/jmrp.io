/**
 * JSON-LD Schema Validation Tests
 *
 * Deep validation of structured data on all page types:
 * - WebSite, BreadcrumbList, SiteNavigationElement (all pages)
 * - BlogPosting (blog posts)
 * - ProfilePage (homepage, CV)
 * - SoftwareApplication (tools)
 *
 * @see https://schema.org/
 */

/* eslint-disable playwright/no-conditional-in-test -- Schema structure requires null checks */
/* eslint-disable playwright/no-conditional-expect -- Conditional expects after schema null guards */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

/** JSON-LD schema object */
interface JsonLdSchema {
  "@type": string | string[];
  "@id"?: string;
  [key: string]: unknown;
}

/** JSON-LD document with optional @graph */
interface JsonLdDocument {
  "@context"?: string | Record<string, unknown>;
  "@graph"?: JsonLdSchema[];
  "@type"?: string | string[];
  [key: string]: unknown;
}

/** Extract and parse JSON-LD from page */
async function getJsonLd(page: Page): Promise<JsonLdDocument> {
  const content = await page
    .locator('script[type="application/ld+json"]')
    .first()
    .textContent();
  if (!content) throw new Error("No JSON-LD found");
  return JSON.parse(content) as JsonLdDocument;
}

/** Check if a schema's @type matches the given type (handles array @type) */
function matchesType(schemaType: unknown, type: string): boolean {
  if (Array.isArray(schemaType)) {
    return schemaType.includes(type);
  }
  return schemaType === type;
}

/** Find schema in @graph by @type */
function findInGraph(
  jsonLd: JsonLdDocument,
  type: string,
): JsonLdSchema | null {
  if (jsonLd["@graph"]) {
    return jsonLd["@graph"].find((i) => matchesType(i["@type"], type)) ?? null;
  }
  return matchesType(jsonLd["@type"], type) ? (jsonLd as JsonLdSchema) : null;
}

/** Find all schemas in @graph by @type */
function findAllInGraph(jsonLd: JsonLdDocument, type: string): JsonLdSchema[] {
  if (jsonLd["@graph"]) {
    return jsonLd["@graph"].filter((i) => matchesType(i["@type"], type));
  }
  return matchesType(jsonLd["@type"], type) ? [jsonLd as JsonLdSchema] : [];
}

/** Check if value is a non-empty string */
function isNonEmptyStr(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Check if value is a valid URL */
function isValidUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Check if value is a valid ISO date string */
function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && value.includes("T");
}

import { blockCloudflare } from "./utils";

// ─── Common Schemas ──────────────────────────────────────────────────

test.describe("Common schemas on representative pages", () => {
  const samplePages = [
    { url: "/", name: "Homepage EN" },
    { url: "/es/", name: "Homepage ES" },
    { url: "/cv", name: "CV" },
    {
      url: "/blog/001-secure-nginx-client-certificates/",
      name: "Blog post",
    },
    { url: "/tools/password-generator/", name: "Tool page" },
  ];

  for (const { url, name } of samplePages) {
    test(`WebSite schema on ${name}`, async ({ page }) => {
      await blockCloudflare(page);
      await page.goto(url);
      const jsonLd = await getJsonLd(page);

      const website = findInGraph(jsonLd, "WebSite");
      expect(website).not.toBeNull();
      if (!website) return;

      expect(website["@type"]).toBe("WebSite");
      expect(isValidUrl(website["@id"])).toBe(true);
      expect(isValidUrl(website.url)).toBe(true);
      expect(isNonEmptyStr(website.name)).toBe(true);
      expect(isNonEmptyStr(website.description)).toBe(true);
      expect(isNonEmptyStr(website.inLanguage)).toBe(true);

      const publisher = website.publisher as JsonLdSchema | undefined;
      expect(publisher).toBeDefined();
      if (publisher) {
        expect(publisher["@type"]).toBe("Person");
        expect(isNonEmptyStr(publisher.name)).toBe(true);
      }
    });

    test(`BreadcrumbList on ${name}`, async ({ page }) => {
      await blockCloudflare(page);
      await page.goto(url);
      const jsonLd = await getJsonLd(page);

      const bc = findInGraph(jsonLd, "BreadcrumbList");
      expect(bc).not.toBeNull();
      if (!bc) return;

      const items = bc.itemListElement as Array<{
        "@type": string;
        position: number;
        name: string;
        item: string;
      }>;
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);

      items.forEach((item, idx) => {
        expect(item["@type"]).toBe("ListItem");
        expect(item.position).toBe(idx + 1);
        expect(isNonEmptyStr(item.name)).toBe(true);
        expect(isValidUrl(item.item)).toBe(true);
      });
    });

    test(`SiteNavigationElement on ${name}`, async ({ page }) => {
      await blockCloudflare(page);
      await page.goto(url);
      const jsonLd = await getJsonLd(page);

      const navItems = findAllInGraph(jsonLd, "SiteNavigationElement");
      expect(navItems.length).toBeGreaterThan(0);

      for (const nav of navItems) {
        expect(isNonEmptyStr(nav.name)).toBe(true);
        expect(isValidUrl(nav.url)).toBe(true);
      }
    });
  }
});

// ─── BlogPosting ─────────────────────────────────────────────────────

test.describe("Article schema", () => {
  test("validates blog post structured data", async ({ page }) => {
    await blockCloudflare(page);
    await page.goto("/blog/001-secure-nginx-client-certificates/");
    const jsonLd = await getJsonLd(page);

    // Engineering guides use the more specific TechArticle; otherwise BlogPosting.
    const post =
      findInGraph(jsonLd, "TechArticle") ?? findInGraph(jsonLd, "BlogPosting");
    expect(post).not.toBeNull();
    if (!post) return;

    expect(isNonEmptyStr(post.headline)).toBe(true);
    expect(isNonEmptyStr(post.description)).toBe(true);
    expect((post.description as string).length).toBeLessThanOrEqual(155);

    expect(isIsoDate(post.datePublished)).toBe(true);
    // dateModified is always emitted (updatedDate when revised, else
    // publishedDate) and must be a valid ISO date.
    expect(isIsoDate(post.dateModified)).toBe(true);

    // Author references the site-wide #person entity (defined in the WebSite node).
    const author = post.author as JsonLdSchema;
    expect(isNonEmptyStr(author["@id"])).toBe(true);
    expect(author["@id"]).toContain("#person");

    expect(isValidUrl(post.image)).toBe(true);
    expect(isNonEmptyStr(post.inLanguage)).toBe(true);

    const mainEntity = post.mainEntityOfPage as JsonLdSchema;
    expect(mainEntity["@type"]).toBe("WebPage");

    const isPartOf = post.isPartOf as JsonLdSchema;
    expect(isPartOf["@id"]).toBeDefined();
  });
});

// ─── ProfilePage (Homepage) ──────────────────────────────────────────

test.describe("ProfilePage schema on homepage", () => {
  test("validates ProfilePage with Person mainEntity", async ({ page }) => {
    await blockCloudflare(page);
    await page.goto("/");
    const jsonLd = await getJsonLd(page);

    const profile = findInGraph(jsonLd, "ProfilePage");
    expect(profile).not.toBeNull();
    if (!profile) return;

    // mainEntity is a typed reference to the canonical #person node, which is
    // defined once as the WebSite publisher (avoids a duplicate, thinner Person
    // sharing the same @id). Resolve the reference and validate the full node.
    const ref = profile.mainEntity as JsonLdSchema;
    expect(ref["@type"]).toBe("Person");

    const website = findInGraph(jsonLd, "WebSite");
    expect(website).not.toBeNull();
    const person = (website?.publisher ?? {}) as JsonLdSchema;
    expect(person["@id"]).toBe(ref["@id"]);
    expect(person["@type"]).toBe("Person");
    expect(isNonEmptyStr(person.name)).toBe(true);
    expect(isValidUrl(person.url)).toBe(true);
    expect(isValidUrl(person.image)).toBe(true);
    expect(isNonEmptyStr(person.jobTitle)).toBe(true);

    const sameAs = person.sameAs as string[];
    expect(Array.isArray(sameAs)).toBe(true);
    expect(sameAs.length).toBeGreaterThan(0);
    for (const url of sameAs) {
      expect(isValidUrl(url)).toBe(true);
    }
  });
});

// ─── ProfilePage (CV) ────────────────────────────────────────────────

test.describe("ProfilePage schema on CV page", () => {
  test("validates detailed Person with education and occupation", async ({
    page,
  }) => {
    await blockCloudflare(page);
    await page.goto("/cv");
    const jsonLd = await getJsonLd(page);

    const profile = findInGraph(jsonLd, "ProfilePage");
    expect(profile).not.toBeNull();
    if (!profile) return;

    const person = profile.mainEntity as JsonLdSchema;
    expect(person["@type"]).toBe("Person");
    expect(isNonEmptyStr(person.name)).toBe(true);

    expect(Array.isArray(person.knowsAbout)).toBe(true);
    expect((person.knowsAbout as unknown[]).length).toBeGreaterThan(0);

    expect(Array.isArray(person.alumniOf)).toBe(true);
    expect((person.alumniOf as unknown[]).length).toBeGreaterThan(0);

    expect(Array.isArray(person.hasOccupation)).toBe(true);
    expect((person.hasOccupation as unknown[]).length).toBeGreaterThan(0);
  });
});

// ─── SoftwareApplication (Tools) ─────────────────────────────────────

test.describe("SoftwareApplication schema on tool pages", () => {
  test("validates tool structured data", async ({ page }) => {
    await blockCloudflare(page);
    await page.goto("/tools/password-generator/");
    const jsonLd = await getJsonLd(page);

    const app = findInGraph(jsonLd, "SoftwareApplication");
    expect(app).not.toBeNull();
    if (!app) return;

    expect(isNonEmptyStr(app.name)).toBe(true);
    expect(isNonEmptyStr(app.description)).toBe(true);
    expect(app.applicationCategory).toBe("WebApplication");
    expect(app.operatingSystem).toBe("Web Browser");

    const offers = app.offers as JsonLdSchema;
    expect(offers["@type"]).toBe("Offer");
    // price is a string per schema.org Offer (spec-correct), paired with isAccessibleForFree.
    expect(offers.price).toBe("0");
    expect(app.isAccessibleForFree).toBe(true);
  });
});

// ─── EN/ES Parity ────────────────────────────────────────────────────

test.describe("EN/ES schema parity", () => {
  test("homepage schemas match between locales", async ({ page }) => {
    await blockCloudflare(page);

    await page.goto("/");
    const enJsonLd = await getJsonLd(page);
    const enTypes = (enJsonLd["@graph"] ?? [])
      .map((i) => i["@type"])
      .sort((a, b) => String(a).localeCompare(String(b)));

    await page.goto("/es/");
    const esJsonLd = await getJsonLd(page);
    const esTypes = (esJsonLd["@graph"] ?? [])
      .map((i) => i["@type"])
      .sort((a, b) => String(a).localeCompare(String(b)));

    expect(enTypes).toEqual(esTypes);

    expect(findInGraph(enJsonLd, "WebSite")?.inLanguage).toBe("en");
    expect(findInGraph(esJsonLd, "WebSite")?.inLanguage).toBe("es");
  });

  test("CV schemas match between locales", async ({ page }) => {
    await blockCloudflare(page);

    await page.goto("/cv");
    const enJsonLd = await getJsonLd(page);
    const enTypes = (enJsonLd["@graph"] ?? [])
      .map((i) => i["@type"])
      .sort((a, b) => String(a).localeCompare(String(b)));

    await page.goto("/es/cv");
    const esJsonLd = await getJsonLd(page);
    const esTypes = (esJsonLd["@graph"] ?? [])
      .map((i) => i["@type"])
      .sort((a, b) => String(a).localeCompare(String(b)));

    expect(enTypes).toEqual(esTypes);

    expect(findInGraph(enJsonLd, "WebSite")?.inLanguage).toBe("en");
    expect(findInGraph(esJsonLd, "WebSite")?.inLanguage).toBe("es");
  });
});

// ─── URL Correctness ─────────────────────────────────────────────────

test.describe("URL correctness in schemas", () => {
  test("all schema URLs are absolute", async ({ page }) => {
    await blockCloudflare(page);
    await page.goto("/");
    const jsonLd = await getJsonLd(page);

    const graph = jsonLd["@graph"] ?? [jsonLd];

    /** Recursively check URL properties */
    const checkUrls = (obj: unknown): void => {
      if (typeof obj !== "object" || obj === null) return;
      const rec = obj as Record<string, unknown>;
      for (const [key, val] of Object.entries(rec)) {
        if (["@id", "url", "item"].includes(key) && typeof val === "string") {
          // All URL-like fields must be absolute http(s) URLs
          expect(
            isValidUrl(val),
            `Expected absolute URL for "${key}" but got: ${val}`,
          ).toBe(true);
        }
        if (typeof val === "object" && val !== null) {
          checkUrls(val);
        }
      }
    };

    for (const schema of graph) {
      checkUrls(schema);
    }
  });

  test("site-owned URLs use consistent domain", async ({ page }) => {
    await blockCloudflare(page);
    await page.goto("/");
    const jsonLd = await getJsonLd(page);

    const graph = jsonLd["@graph"] ?? [jsonLd];
    const siteUrls: string[] = [];

    // Keys whose children contain external URLs by design
    const externalKeys = new Set([
      "sameAs",
      "worksFor",
      "alumni",
      "alumniOf",
      "hasCredential",
      "memberOf",
      "identifier", // ORCID PropertyValue.url points to orcid.org by design
    ]);

    /** Collect @id and url values (skip external subtrees) */
    const collectSiteUrls = (obj: unknown, insideExternal = false): void => {
      if (typeof obj !== "object" || obj === null) return;
      if (Array.isArray(obj)) {
        obj.forEach((item) => collectSiteUrls(item, insideExternal));
        return;
      }
      const rec = obj as Record<string, unknown>;
      for (const [key, val] of Object.entries(rec)) {
        const isExtKey = externalKeys.has(key);
        if (
          !insideExternal &&
          !isExtKey &&
          ["@id", "url", "item"].includes(key) &&
          typeof val === "string" &&
          isValidUrl(val)
        ) {
          siteUrls.push(val);
        }
        if (typeof val === "object" && val !== null) {
          collectSiteUrls(val, insideExternal || isExtKey);
        }
      }
    };

    for (const schema of graph) {
      collectSiteUrls(schema);
    }

    // Normalize origins (handle hash-based @id like "https://jmrp.io#breadcrumb")
    const origins = [...new Set(siteUrls.map((u) => new URL(u).origin))];
    expect(origins.length).toBeLessThanOrEqual(1);
  });
});
