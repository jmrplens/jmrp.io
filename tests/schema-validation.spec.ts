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

/**
 * Extract the URL from an `image` value that may be a plain string or a
 * schema.org `ImageObject` (the canonical Person and Article nodes both emit
 * `image` as an ImageObject with width/height, not a bare URL string).
 */
function imageUrl(value: unknown): unknown {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "url" in value) {
    return (value as Record<string, unknown>).url;
  }
  return undefined;
}

import { blockCloudflare } from "./utils";

// ─── Canonical identity document ─────────────────────────────────────

test.describe("Canonical identity document", () => {
  /**
   * `/identity/person.jsonld` is the standalone description of the `#person`
   * entity, consumed at BUILD time by the five project documentation sites
   * that restate the same `@id`.
   *
   * It is produced by `scripts/ci/build-identity.mjs`, which re-implements the
   * assembly that also lives in `BaseHead.astro` — a .astro component cannot be
   * imported from a plain Node script. `--check` in that script only proves the
   * file matches its YAML sources; it cannot prove the script and the component
   * agree. This test closes that gap: if the two ever diverge, whichever is
   * wrong, CI fails here.
   */
  test("matches the Person node rendered by BaseHead", async ({ page }) => {
    await blockCloudflare(page);

    const response = await page.request.get("/identity/person.jsonld");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/ld+json");

    const { "@context": context, ...document } =
      (await response.json()) as Record<string, unknown>;
    // Standalone documents must carry their own context; the page `@graph`
    // declares it once for every node, which is why it is stripped here.
    expect(context).toBe("https://schema.org");

    await page.goto("/");
    const jsonLd = await getJsonLd(page);
    const website = findInGraph(jsonLd, "WebSite");
    expect(website).toBeTruthy();

    expect(website?.publisher).toEqual(document);
  });

  test("advertises a reachable, non-fingerprinted avatar", async ({ page }) => {
    await blockCloudflare(page);
    const response = await page.request.get("/identity/person.jsonld");
    const document = (await response.json()) as {
      image?: { url?: string };
    };

    // A fingerprinted /_astro/ URL rots the moment this site rebuilds, which
    // is precisely how a downstream project site ended up publishing a dead
    // image. See CANONICAL_PERSON_IMAGE in src/utils/person.ts.
    expect(document.image?.url).not.toContain("/_astro/");
    expect(document.image?.url).toBe("https://github.com/jmrplens.png");
  });
});

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

    // image is an ImageObject (with width/height), not a bare URL string.
    const postImage = post.image as JsonLdSchema;
    expect(postImage["@type"]).toBe("ImageObject");
    expect(isValidUrl(imageUrl(postImage))).toBe(true);
    expect(isNonEmptyStr(post.inLanguage)).toBe(true);

    const mainEntity = post.mainEntityOfPage as JsonLdSchema;
    expect(mainEntity["@type"]).toBe("WebPage");

    const isPartOf = post.isPartOf as JsonLdSchema;
    expect(isPartOf["@id"]).toBeDefined();
  });
});

// ─── ProfilePage (Homepage → WebPage; canonical ProfilePage lives at /about/) ──

test.describe("ProfilePage schema on homepage", () => {
  test("homepage emits WebPage referencing #person, not a duplicate ProfilePage", async ({
    page,
  }) => {
    await blockCloudflare(page);
    await page.goto("/");
    const jsonLd = await getJsonLd(page);

    // The home page must NOT emit its own ProfilePage: the canonical
    // author-entity page is /about/ (see AboutPage.astro). A second
    // ProfilePage here would duplicate the identity data across pages.
    expect(findInGraph(jsonLd, "ProfilePage")).toBeNull();

    const homePage = findInGraph(jsonLd, "WebPage");
    expect(homePage).not.toBeNull();
    if (!homePage) return;

    expect(isValidUrl(homePage["@id"])).toBe(true);
    expect(isValidUrl(homePage.url)).toBe(true);
    expect(isNonEmptyStr(homePage.name)).toBe(true);
    expect(isNonEmptyStr(homePage.description)).toBe(true);
    expect(isNonEmptyStr(homePage.inLanguage)).toBe(true);

    const isPartOf = homePage.isPartOf as JsonLdSchema;
    expect(isNonEmptyStr(isPartOf["@id"])).toBe(true);
    expect(isPartOf["@id"]).toContain("#website");

    // `about` is a typed reference to the canonical #person node, which is
    // defined once as the WebSite publisher (avoids a duplicate, thinner
    // Person sharing the same @id). Resolve the reference and validate it.
    const about = homePage.about as JsonLdSchema;
    expect(isNonEmptyStr(about["@id"])).toBe(true);
    expect(about["@id"]).toContain("#person");

    const website = findInGraph(jsonLd, "WebSite");
    expect(website).not.toBeNull();
    const person = (website?.publisher ?? {}) as JsonLdSchema;
    expect(person["@id"]).toBe(about["@id"]);
    expect(person["@type"]).toBe("Person");
    expect(isNonEmptyStr(person.name)).toBe(true);
    expect(isValidUrl(person.url)).toBe(true);
    expect(isNonEmptyStr(person.jobTitle)).toBe(true);

    // image is an ImageObject (with width/height), not a bare URL string.
    const personImage = person.image as JsonLdSchema;
    expect(personImage["@type"]).toBe("ImageObject");
    expect(isValidUrl(imageUrl(personImage))).toBe(true);

    const sameAs = person.sameAs as string[];
    expect(Array.isArray(sameAs)).toBe(true);
    expect(sameAs.length).toBeGreaterThan(0);
    for (const url of sameAs) {
      expect(isValidUrl(url)).toBe(true);
    }
  });

  test("the canonical ProfilePage lives at /about/", async ({ page }) => {
    await blockCloudflare(page);
    await page.goto("/about/");
    const jsonLd = await getJsonLd(page);

    const profile = findInGraph(jsonLd, "ProfilePage");
    expect(profile).not.toBeNull();
    if (!profile) return;

    expect(isNonEmptyStr(profile["@id"])).toBe(true);
    expect(profile["@id"]).toContain("#profile");
    expect(isIsoDate(profile.dateModified)).toBe(true);

    // mainEntity is a typed reference to the same canonical #person node
    // used as the WebSite publisher — it must resolve to the exact same @id.
    const ref = profile.mainEntity as JsonLdSchema;
    expect(ref["@type"]).toBe("Person");
    expect(isNonEmptyStr(ref["@id"])).toBe(true);
    expect(ref["@id"]).toContain("#person");

    const website = findInGraph(jsonLd, "WebSite");
    expect(website).not.toBeNull();
    const person = (website?.publisher ?? {}) as JsonLdSchema;
    expect(person["@id"]).toBe(ref["@id"]);
  });
});

// ─── Person (CV) ─────────────────────────────────────────────────────

test.describe("Person schema on CV page", () => {
  test("validates the additive Person node plus the canonical #person it augments", async ({
    page,
  }) => {
    await blockCloudflare(page);
    await page.goto("/cv");
    const jsonLd = await getJsonLd(page);

    // /cv/ is not the canonical ProfilePage (that's /about/) — it emits a
    // plain WebPage plus a SEPARATE, additive Person node.
    expect(findInGraph(jsonLd, "ProfilePage")).toBeNull();

    const webPage = findInGraph(jsonLd, "WebPage");
    expect(webPage).not.toBeNull();
    if (webPage) {
      const mainEntity = webPage.mainEntity as JsonLdSchema;
      expect(isNonEmptyStr(mainEntity["@id"])).toBe(true);
      expect(mainEntity["@id"]).toContain("#person");
    }

    // The additive top-level Person node only carries occupation/education/
    // credential facts — findInGraph only matches top-level @graph entries,
    // so this resolves to the CV-specific node, not the nested WebSite publisher.
    const additivePerson = findInGraph(jsonLd, "Person");
    expect(additivePerson).not.toBeNull();
    if (!additivePerson) return;

    expect(isNonEmptyStr(additivePerson["@id"])).toBe(true);
    expect(additivePerson["@id"]).toContain("#person");

    expect(Array.isArray(additivePerson.alumniOf)).toBe(true);
    expect((additivePerson.alumniOf as unknown[]).length).toBeGreaterThan(0);

    expect(Array.isArray(additivePerson.hasOccupation)).toBe(true);
    expect((additivePerson.hasOccupation as unknown[]).length).toBeGreaterThan(
      0,
    );

    expect(Array.isArray(additivePerson.hasCredential)).toBe(true);
    expect((additivePerson.hasCredential as unknown[]).length).toBeGreaterThan(
      0,
    );

    // The additive node must NOT redefine identity fields owned by the
    // canonical #person — otherwise two divergent copies of the same @id
    // would coexist in the graph.
    expect(additivePerson.name).toBeUndefined();
    expect(additivePerson.jobTitle).toBeUndefined();
    expect(additivePerson.image).toBeUndefined();
    expect(additivePerson.knowsAbout).toBeUndefined();
    expect(additivePerson.sameAs).toBeUndefined();

    // The canonical, fully-populated #person lives once, nested as the
    // WebSite publisher — it carries the identity fields the additive
    // node deliberately omits.
    const website = findInGraph(jsonLd, "WebSite");
    expect(website).not.toBeNull();
    const canonicalPerson = (website?.publisher ?? {}) as JsonLdSchema;
    expect(canonicalPerson["@id"]).toBe(additivePerson["@id"]);
    expect(canonicalPerson["@type"]).toBe("Person");
    expect(isNonEmptyStr(canonicalPerson.name)).toBe(true);
    expect(isNonEmptyStr(canonicalPerson.jobTitle)).toBe(true);

    expect(Array.isArray(canonicalPerson.knowsAbout)).toBe(true);
    expect((canonicalPerson.knowsAbout as unknown[]).length).toBeGreaterThan(0);
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
      // Person.owns references the projects' `#software` entities, whose
      // canonical @id is the GitHub repo URL — the SAME identifier each
      // project's own docs site publishes. Off-domain by design.
      "owns",
    ]);

    // Wikidata's canonical entity concept URI (http, not https, by design —
    // the standard Linked Data identifier). The Person's `knowsAbout` emits
    // these as `@id` values (see BaseHead.astro `KNOWS_ABOUT_WIKIDATA`); it is
    // a legitimate, deliberate exception to the site's https-only own-domain
    // URLs, not a key-scoped external subtree like `sameAs`/`alumniOf`.
    const isWikidataEntityUri = (value: string): boolean =>
      // eslint-disable-next-line unicorn/prefer-https, sonarjs/no-clear-text-protocols -- see comment above
      value.startsWith("http://www.wikidata.org/entity/");

    // The canonical Person avatar is deliberately hosted off-domain: Astro
    // fingerprints built assets, so a /_astro/ URL rots on every deploy and
    // poisons the project sites that copy this node. Exempted by exact value
    // rather than by adding "image" to externalKeys, which would stop checking
    // every other image URL on the site (article covers, OG images) too.
    const isCanonicalAvatarUrl = (value: string): boolean =>
      value === "https://github.com/jmrplens.png";

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
          isValidUrl(val) &&
          !isWikidataEntityUri(val) &&
          !isCanonicalAvatarUrl(val)
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

// ─── Publications ────────────────────────────────────────────────────

test.describe("ScholarlyArticle schema on the publications page", () => {
  test("identifies works by DOI and keeps off-site landing pages in sameAs", async ({
    page,
  }) => {
    await blockCloudflare(page);
    await page.goto("/publications/");
    const jsonLd = await getJsonLd(page);

    const collection = findInGraph(jsonLd, "CollectionPage");
    expect(collection).not.toBeNull();
    if (!collection) return;

    const itemList = collection.mainEntity as JsonLdSchema;
    const listItems = itemList.itemListElement as JsonLdSchema[];
    const articles = listItems.map((li) => li.item as JsonLdSchema);
    expect(articles.length).toBeGreaterThan(0);

    // Every work that has a DOI is identified by it.
    const withDoi = articles.filter(
      (a) => isNonEmptyStr(a.url) && a.url.startsWith("https://doi.org/"),
    );
    expect(withDoi.length).toBeGreaterThan(0);

    // A landing page hosted elsewhere (institutional repository, handle) is a
    // distinct reference for the work and must survive alongside the DOI. This
    // one arrives in the BibTeX `pdf` field rather than `url`.
    const handles = articles.flatMap((a) =>
      ((a.sameAs as string[] | undefined) ?? []).filter((u) =>
        u.includes("hdl.handle.net"),
      ),
    );
    expect(handles.length).toBeGreaterThan(0);

    // sameAs must never carry a relative path or a PDF hosted on this site:
    // that is the file itself, not a reference page identifying the work.
    for (const article of articles) {
      for (const url of (article.sameAs as string[] | undefined) ?? []) {
        expect(url).toMatch(/^https?:\/\//);
        expect(url).not.toMatch(/jmrp\.io\/pdf\//);
      }
    }
  });
});
