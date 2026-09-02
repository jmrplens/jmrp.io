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

import fs from "node:fs";
import path from "node:path";

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

/**
 * Find the page's own SoftwareApplication node (the tool). The graph also
 * carries the MCP endpoint nodes, dual-typed ["WebAPI","SoftwareApplication"],
 * which a plain type lookup would match first. They now carry a `name` (the
 * endpoint's last path segment, exactly as mcp.jmrp.io's canonical card
 * publishes it) and a `documentation` URL, so the tool cannot be told apart by
 * the absence of a name: the discriminator is, and always was, `@type`.
 */
function findToolApp(jsonLd: JsonLdDocument): JsonLdSchema | null {
  return (
    findAllInGraph(jsonLd, "SoftwareApplication").find(
      (node) => !matchesType(node["@type"], "WebAPI"),
    ) ?? null
  );
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

/**
 * Check a Text-valued property that may carry one value per language.
 *
 * The canonical `#person` node has ONE `@id`, so properties like `jobTitle`
 * cannot change with the page locale — they are JSON-LD language-tagged
 * literals (`[{ "@value": …, "@language": "en" }, …]`) rather than a bare
 * string, which is what the site emitted before and what left the same entity
 * holding two contradictory job titles depending on which page was crawled.
 * Both shapes are accepted here so the assertion describes the contract rather
 * than the encoding.
 */
function isNonEmptyText(value: unknown): boolean {
  if (isNonEmptyStr(value)) return true;
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(
    (entry: unknown) =>
      typeof entry === "object" &&
      entry !== null &&
      isNonEmptyStr((entry as Record<string, unknown>)["@value"]) &&
      isNonEmptyStr((entry as Record<string, unknown>)["@language"]),
  );
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
    // image. The avatar therefore lives at a fixed path under public/, on this
    // origin. See CANONICAL_PERSON_IMAGE in src/utils/person.ts.
    expect(document.image?.url).not.toContain("/_astro/");
    expect(document.image?.url).toBe("https://jmrp.io/identity/avatar.png");

    // Advertised, therefore fetchable: a 404 here is the exact failure this
    // whole arrangement exists to prevent.
    const avatar = await page.request.get("/identity/avatar.png");
    expect(avatar.status()).toBe(200);
    expect(avatar.headers()["content-type"]).toContain("image/png");
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
      // Same reasoning as the canonical #person node: #website has ONE `@id`,
      // so a bare per-locale string made the EN and ES pages assert two
      // contradictory descriptions — and two contradictory languages — for
      // one entity. The description is now a language-tagged literal and
      // `inLanguage` declares both languages, because the site genuinely is
      // both. See `localizedValues` in BaseHead.astro.
      expect(isNonEmptyText(website.description)).toBe(true);
      expect(website.inLanguage).toEqual(["en", "es"]);

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

      // Regression guard: Spanish pages once emitted translated nav labels
      // pointing at English URLs, so the schema contradicted the rendered
      // <nav> on every /es/ page. Asserting the locale prefix here is what
      // makes that specific bug impossible to reintroduce silently — the
      // generic "is a URL" checks above all passed while it was broken.
      if (url.startsWith("/es")) {
        for (const nav of navItems) {
          const path = new URL(String(nav.url)).pathname;
          expect(
            path === "/es/" || path.startsWith("/es/"),
            `Spanish nav entry "${String(nav.name)}" points at ${path}, which is not under /es/`,
          ).toBe(true);
        }
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

    // `isPartOf` is a single node for standalone posts and an array for posts
    // that also belong to a curated series (post 001 opens nginx-hardening).
    // Both shapes are valid JSON-LD; normalize before asserting.
    const isPartOf = [post.isPartOf].flat() as JsonLdSchema[];
    expect(isPartOf.length).toBeGreaterThan(0);
    for (const node of isPartOf) expect(isValidUrl(node["@id"])).toBe(true);
    expect(
      isPartOf.some((node) => String(node["@id"]).endsWith("#website")),
    ).toBe(true);
    // The series edge is the half that used to be missing: hubs linked down to
    // their members and nothing linked back up.
    expect(
      isPartOf.some((node) => String(node["@id"]).includes("/blog/series/")),
    ).toBe(true);
  });

  test("article @id matches page canonical in both locales", async ({
    page,
  }) => {
    await blockCloudflare(page);

    await page.goto("/blog/012-device-bound-key-derivation/");
    const enJsonLd = await getJsonLd(page);
    const enArticle =
      findInGraph(enJsonLd, "TechArticle") ??
      findInGraph(enJsonLd, "BlogPosting");
    expect(enArticle).not.toBeNull();
    const enCanonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute("href");
    if (enArticle) {
      expect(enArticle["@id"]).toBe(`${enCanonical}#article`);
      const enMainEntity = enArticle.mainEntityOfPage as JsonLdSchema;
      expect(enMainEntity["@id"]).toBe(enCanonical);
    }

    await page.goto("/es/blog/012-device-bound-key-derivation/");
    const esJsonLd = await getJsonLd(page);
    const esArticle =
      findInGraph(esJsonLd, "TechArticle") ??
      findInGraph(esJsonLd, "BlogPosting");
    expect(esArticle).not.toBeNull();
    const esCanonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute("href");
    if (esArticle) {
      expect(esArticle["@id"]).toBe(`${esCanonical}#article`);
      const esMainEntity = esArticle.mainEntityOfPage as JsonLdSchema;
      expect(esMainEntity["@id"]).toBe(esCanonical);
    }
  });

  test("EN and ES articles cross-reference as translations", async ({
    page,
  }) => {
    await blockCloudflare(page);

    await page.goto("/blog/012-device-bound-key-derivation/");
    const enJsonLd = await getJsonLd(page);
    const enArticle =
      findInGraph(enJsonLd, "TechArticle") ??
      findInGraph(enJsonLd, "BlogPosting");
    expect(enArticle).not.toBeNull();
    if (enArticle) {
      const workTranslation = enArticle.workTranslation as JsonLdSchema;
      expect(workTranslation["@id"]).toBe(
        "https://jmrp.io/es/blog/012-device-bound-key-derivation/#article",
      );
    }

    await page.goto("/es/blog/012-device-bound-key-derivation/");
    const esJsonLd = await getJsonLd(page);
    const esArticle =
      findInGraph(esJsonLd, "TechArticle") ??
      findInGraph(esJsonLd, "BlogPosting");
    expect(esArticle).not.toBeNull();
    if (esArticle) {
      const translationOfWork = esArticle.translationOfWork as JsonLdSchema;
      expect(translationOfWork["@id"]).toBe(
        "https://jmrp.io/blog/012-device-bound-key-derivation/#article",
      );
    }
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
    expect(isNonEmptyText(person.jobTitle)).toBe(true);

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

  test("Person.identifier is an array and sameAs excludes opted-out networks", async ({
    page,
  }) => {
    await blockCloudflare(page);
    await page.goto("/");
    const jsonLd = await getJsonLd(page);

    const website = findInGraph(jsonLd, "WebSite");
    expect(website).not.toBeNull();
    const person = (website?.publisher ?? {}) as JsonLdSchema;

    // Must stay an array: a bare object silently drops any identifier past
    // the first (e.g. a future Wikidata Q-id alongside ORCID).
    expect(Array.isArray(person.identifier)).toBe(true);
    const identifiers = person.identifier as Array<{ propertyID: string }>;
    expect(identifiers.length).toBeGreaterThan(0);
    expect(identifiers[0].propertyID).toBe("ORCID");

    // Networks the site owner has deliberately opted out of. They exist, but he
    // does not want them referenced anywhere on the site — an audit tool
    // suggesting "add the profiles we found" is not grounds to publish them.
    const OPTED_OUT = ["x.com", "twitter.com", "ko-fi.com"];
    for (const host of OPTED_OUT) {
      expect((person.sameAs as string[]).some((u) => u.includes(host))).toBe(
        false,
      );
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
    expect(isNonEmptyText(canonicalPerson.jobTitle)).toBe(true);

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

    const app = findToolApp(jsonLd);
    expect(app).not.toBeNull();
    if (!app) return;

    expect(isNonEmptyStr(app.name)).toBe(true);
    expect(isNonEmptyStr(app.description)).toBe(true);
    // password-generator's collection `category` is "security".
    expect(app.applicationCategory).toBe("SecurityApplication");
    expect(app.operatingSystem).toBe("Web Browser");

    const offers = app.offers as JsonLdSchema;
    expect(offers["@type"]).toBe("Offer");
    // price is a string per schema.org Offer (spec-correct), paired with isAccessibleForFree.
    expect(offers.price).toBe("0");
    expect(offers.availability).toBe("https://schema.org/InStock");
    expect(isValidUrl(offers.url)).toBe(true);
    expect(app.isAccessibleForFree).toBe(true);
  });

  test("tools use Google application categories", async ({ page }) => {
    await blockCloudflare(page);
    await page.goto("/tools/csp-builder/");
    const jsonLd = await getJsonLd(page);

    const app = findToolApp(jsonLd);
    expect(app).not.toBeNull();
    if (!app) return;

    // csp-builder's collection `category` is "security".
    expect(app.applicationCategory).toBe("SecurityApplication");

    const offers = app.offers as JsonLdSchema;
    expect(offers.availability).toBe("https://schema.org/InStock");
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

    // #website is ONE entity shared by both locales, so it must NOT report a
    // different language depending on which page was crawled. Both pages
    // declare the same bilingual value; the per-page language lives on the
    // page-scoped nodes (WebPage/ProfilePage/TechArticle) instead.
    expect(findInGraph(enJsonLd, "WebSite")?.inLanguage).toEqual(["en", "es"]);
    expect(findInGraph(esJsonLd, "WebSite")?.inLanguage).toEqual(["en", "es"]);
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

    // #website is ONE entity shared by both locales, so it must NOT report a
    // different language depending on which page was crawled. Both pages
    // declare the same bilingual value; the per-page language lives on the
    // page-scoped nodes (WebPage/ProfilePage/TechArticle) instead.
    expect(findInGraph(enJsonLd, "WebSite")?.inLanguage).toEqual(["en", "es"]);
    expect(findInGraph(esJsonLd, "WebSite")?.inLanguage).toEqual(["en", "es"]);
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
          !isWikidataEntityUri(val)
        ) {
          siteUrls.push(val);
        }
        if (typeof val === "object" && val !== null) {
          collectSiteUrls(val, insideExternal || isExtKey);
        }
      }
    };

    for (const schema of graph) {
      // MCP endpoint stubs are dual-typed ["WebAPI","SoftwareApplication"]
      // references whose canonical @id/url live on mcp.jmrp.io by design —
      // the subdomain hosts those entities' own fiches.
      if (matchesType(schema["@type"], "WebAPI")) continue;
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
    // Matched on the parsed hostname, not a substring: "hdl.handle.net" can
    // appear anywhere in an arbitrary URL's path.
    const handles = articles.flatMap((a) =>
      ((a.sameAs as string[] | undefined) ?? []).filter(
        (u) => new URL(u).hostname === "hdl.handle.net",
      ),
    );
    expect(handles.length).toBeGreaterThan(0);

    // sameAs must never carry a relative path or a PDF hosted on this site:
    // that is the file itself, not a reference page identifying the work.
    for (const article of articles) {
      for (const url of (article.sameAs as string[] | undefined) ?? []) {
        expect(url).toMatch(/^https?:\/\//);
        const parsed = new URL(url);
        expect(
          parsed.hostname === "jmrp.io" && parsed.pathname.startsWith("/pdf/"),
        ).toBe(false);
      }
    }
  });
});

// ─── CollectionPage (Uses) ───────────────────────────────────────────

test.describe("CollectionPage schema on the uses page", () => {
  test("uses page emits a CollectionPage entity referencing #person", async ({
    page,
  }) => {
    await blockCloudflare(page);
    await page.goto("/uses/");
    const jsonLd = await getJsonLd(page);

    const collection = findInGraph(jsonLd, "CollectionPage");
    expect(collection).not.toBeNull();
    if (!collection) return;

    expect(collection["@id"]).toBe("https://jmrp.io/uses/#collection");
    expect(collection.url).toBe("https://jmrp.io/uses/");
    expect(isNonEmptyStr(collection.name)).toBe(true);
    expect(isNonEmptyStr(collection.description)).toBe(true);
    expect(isNonEmptyStr(collection.inLanguage)).toBe(true);

    const isPartOf = collection.isPartOf as JsonLdSchema;
    expect(isNonEmptyStr(isPartOf["@id"])).toBe(true);
    expect(isPartOf["@id"]).toContain("#website");

    const about = collection.about as JsonLdSchema;
    expect(about["@id"]).toBe("https://jmrp.io/#person");
  });
});

test.describe("Locale-scoped entity @ids", () => {
  /**
   * Every entity a page DEFINES must be identified under that page's own
   * canonical URL.
   *
   * This invariant has been broken twice by the same mistake — building a URL
   * from a hardcoded `/blog/…` or `/tools/…` literal in a component that
   * serves both locales, so the Spanish page publishes the English `@id`. Each
   * time, two documents collapsed into a single entity carrying two names, two
   * languages and both sets of FAQ answers. Both times a human spotted it in
   * review rather than a test catching it, which is why this sweeps every
   * Spanish page rather than sampling.
   *
   * It reads `dist/` instead of driving a browser: 71 navigations blow the
   * per-test timeout, and nothing here needs a rendered page — the graph is
   * server-emitted.
   *
   * A node is a DEFINITION when it carries `@type`; a bare `{"@id": …}` is a
   * reference and may legitimately point elsewhere — that is exactly how
   * `workTranslation` links the two locales. Fragment `@id`s name entities
   * scoped to the current document, so their base must be the canonical.
   * `#person` and `#website` are the deliberate exceptions: one identity and
   * one site, shared across every page and both locales.
   */
  const SITE_WIDE_IDS = new Set([
    "https://jmrp.io/#person",
    "https://jmrp.io/#website",
  ]);

  /** Recursively collect every `.html` file under a directory. */
  function htmlFilesIn(dir: string, found: string[] = []): string[] {
    if (!fs.existsSync(dir)) return found;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) htmlFilesIn(full, found);
      else if (entry.endsWith(".html")) found.push(full);
    }
    return found;
  }

  /**
   * Reads the canonical href. Attribute order is not stable: the post-build
   * minifier sorts attributes, so `rel` may precede or follow `href`.
   */
  function canonicalOf(html: string): string | null {
    for (const tag of html.match(/<link\b[^>]*>/g) ?? []) {
      if (!/\brel=(["']?)canonical\1/.test(tag)) continue;
      return /\bhref=(["'])(.*?)\1/.exec(tag)?.[2] ?? null;
    }
    return null;
  }

  test("every Spanish page scopes its own entities under /es/", () => {
    const esDir = path.join(path.resolve("dist"), "es");
    const pages = htmlFilesIn(esDir);
    expect(pages.length, "No Spanish pages found in dist/es").toBeGreaterThan(
      0,
    );

    const offenders: string[] = [];

    for (const file of pages) {
      const html = fs.readFileSync(file, "utf-8");
      const canonical = canonicalOf(html);
      // Anchored to <script>: a <link rel="alternate" type="application/ld+json">
      // also matches the bare media type, and would capture from there to the
      // next </script> — i.e. markup, not the graph.
      const raw =
        /<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/.exec(
          html,
        )?.[1];
      if (!raw) continue;

      const graph =
        (JSON.parse(raw) as JsonLdDocument)["@graph"] ?? ([] as JsonLdSchema[]);

      for (const node of graph) {
        const id = node["@id"];
        if (!node["@type"] || !id) continue;
        if (!id.startsWith("https://jmrp.io/") || !id.includes("#")) continue;
        if (SITE_WIDE_IDS.has(id)) continue;
        if (canonical && id.startsWith(canonical)) continue;
        offenders.push(
          `${path.relative("dist", file)} → ${String(node["@type"])} ${id}`,
        );
      }
    }

    expect(
      offenders,
      `Entities defined under a URL that is not their page's canonical:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  /**
   * Same defect class, different node type.
   *
   * SiteNavigationElement once shipped Spanish labels on English URLs; that
   * was fixed and guarded. The identical bug then reappeared in
   * ToolCategoryPage, whose ListItem URLs were built without translatePath(),
   * pairing a Spanish `name` with an English `url` on 17 entries across the
   * five ES category pages. The per-page guard on the sample list above would
   * never have caught it — no category page is in that list — so this walks
   * every built Spanish page instead.
   */
  test("every Spanish page keeps its ListItem URLs under /es/", () => {
    const esDir = path.join(path.resolve("dist"), "es");
    const pages = htmlFilesIn(esDir);
    expect(pages.length, "No Spanish pages found in dist/es").toBeGreaterThan(
      0,
    );

    const offenders: string[] = [];

    for (const file of pages) {
      const html = fs.readFileSync(file, "utf-8");
      const raw =
        /<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/.exec(
          html,
        )?.[1];
      if (!raw) continue;

      const collect = (node: unknown): void => {
        if (Array.isArray(node)) {
          for (const child of node) collect(child);
          return;
        }
        if (!node || typeof node !== "object") return;
        const record = node as Record<string, unknown>;

        if (matchesType(record["@type"], "ListItem")) {
          const target = record.item;
          const candidates = [
            record.url,
            typeof target === "string" ? target : undefined,
            target && typeof target === "object"
              ? (target as Record<string, unknown>)["@id"]
              : undefined,
          ];

          for (const candidate of candidates) {
            if (typeof candidate !== "string") continue;

            // Parse first and compare the hostname, rather than
            // `startsWith("https://jmrp.io")` — that prefix also matches
            // `https://jmrp.io.example.com/…` (CodeQL
            // js/incomplete-url-substring-sanitization). Same idiom as
            // `isOrcidUrl` in BaseHead.astro.
            let parsed;
            try {
              parsed = new URL(candidate);
            } catch {
              continue; // Not an absolute URL: nothing to locale-check.
            }
            if (parsed.hostname !== "jmrp.io") continue;

            const { pathname } = parsed;
            // The site root is a legitimate breadcrumb ancestor, and
            // /publications/ is the deliberately locale-neutral identifier
            // for the one paper with no DOI — both locales must mint the
            // same id there or the work splits into two entities.
            if (pathname === "/" || pathname.startsWith("/publications/")) {
              continue;
            }
            if (pathname.startsWith("/es/")) continue;

            offenders.push(
              `${path.relative("dist", file)} → "${String(record.name)}" → ${pathname}`,
            );
          }
        }

        for (const value of Object.values(record)) collect(value);
      };

      collect(JSON.parse(raw));
    }

    expect(
      offenders,
      `Spanish ListItem entries pointing outside /es/:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});

/**
 * Reference extraction — what the bibliography and `citation` publish.
 *
 * Both surfaces are built from one list in BlogPost.astro, collected from the
 * raw MDX body with a regex, so markdown syntax can leak into a published URL
 * or a published name — and a regex change can silently DROP a reference
 * instead. All three happened or were risked, and neither the type checker nor
 * Lychee could see any of them: the broken URL kept a valid Wikipedia *path*
 * and only corrupted the fragment, which link checkers do not resolve; a name
 * is just a string; and a missing reference produces no error at all
 * (GEO audit 2026-09-02, M3).
 *
 * Reads `dist/` rather than driving a browser: the graph is server-emitted and
 * 48 navigations would blow the per-test timeout. This mirrors the Spanish-@id
 * sweep earlier in this file, which reads `dist/` for the same reason.
 */
test.describe("Post references", () => {
  /** Every built post page, both locales. */
  function postPagesIn(dir: string, found: string[] = []): string[] {
    if (!fs.existsSync(dir)) return found;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) postPagesIn(full, found);
      else if (entry === "index.html") found.push(full);
    }
    return found;
  }

  /**
   * Raw markdown that must never reach a published citation name.
   *
   * Deliberately only the PAIRED forms that `stripEmphasis` in BlogPost.astro
   * actually removes. A lone `**` or `__` is not a defect — CommonMark renders
   * an unpaired delimiter literally, so "The C** standard" is the correct
   * published name and flagging it would turn CI red on content the component
   * cannot clean.
   *
   * Split into one regex per form rather than a single alternation: the
   * combined pattern scores 23 on `sonarjs/regex-complexity`, over the repo's
   * limit of 20. `_` is matched only when NOT intraword, so identifiers lifted
   * out of inline code (`mbedtls_ct_memcmp`, `SOURCE_DATE_EPOCH`) do not trip
   * it. `***x***` / `___x___` are covered by the `**` / `__` entries.
   */
  const RAW_MARKDOWN = [
    /\*\*(?=\S)[\s\S]*?\S\*\*/u,
    /~~(?=\S)[\s\S]*?\S~~/u,
    /(?<![\p{L}\p{N}])__(?=\S)[\s\S]*?\S__(?![\p{L}\p{N}])/u,
    /\*(?=\S)[^*\n]*?\S\*/u,
    /(?<![\p{L}\p{N}])_(?=\S)[^_\n]*?\S_(?![\p{L}\p{N}])/u,
  ];

  /**
   * The corpus-wide citation floor.
   *
   * A tripwire for a mass drop, NOT a pin on the exact count: the build ships
   * 408 citations across 24 post pages today (minimum 9 on a single page), so
   * this leaves room to remove a couple of posts without a false failure while
   * still failing loudly if an extraction change stops matching. Raise it when
   * the corpus grows enough to make it slack.
   */
  const MIN_TOTAL_CITATIONS = 300;

  /** Entities Astro escapes inside a double-quoted attribute value. */
  const ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    "#39": "'",
    "#x27": "'",
  };

  /**
   * Decodes an href read straight out of the built HTML.
   *
   * @param value - Raw attribute value.
   * @returns The URL as the browser would resolve it.
   */
  function decodeHref(value: string): string {
    return value.replaceAll(
      /&(amp|lt|gt|quot|#39|#x27);/g,
      (_, entity: string) => ENTITIES[entity] ?? _,
    );
  }

  const postPages = [
    ...postPagesIn(path.join("dist", "blog")),
    ...postPagesIn(path.join("dist", "es", "blog")),
  ].filter((file) => /\/blog\/\d{3}-/.test(file.replaceAll("\\", "/")));

  test("citations publish resolvable URLs, rendered names and a bibliography", () => {
    expect(postPages.length, "No built post pages found").toBeGreaterThan(0);

    const badUrls: string[] = [];
    const badNames: string[] = [];
    const orphanCitations: string[] = [];
    const emptyBibliographies: string[] = [];
    let pagesWithCitations = 0;
    let totalCitations = 0;

    for (const file of postPages) {
      const html = fs.readFileSync(file, "utf-8");
      const raw =
        /<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/.exec(
          html,
        )?.[1];
      if (!raw) continue;

      const graph = (JSON.parse(raw) as JsonLdDocument)["@graph"] ?? [];
      const article = graph.find((node) =>
        ["BlogPosting", "TechArticle"].some((type) =>
          matchesType(node["@type"], type),
        ),
      );
      const citations = article?.citation;
      const where = path.relative("dist", file);

      // A rendered bibliography with an empty `citation` array (or the reverse)
      // means the two surfaces have come apart, or extraction returned nothing.
      if (!Array.isArray(citations) || citations.length === 0) {
        if (html.includes("references-list")) emptyBibliographies.push(where);
        continue;
      }
      pagesWithCitations++;
      totalCitations += citations.length;

      const hrefs = new Set(
        [...html.matchAll(/<a\b[^>]*?href="([^"]*)"/g)].map((m) =>
          decodeHref(m[1]),
        ),
      );

      for (const citation of citations as { name?: string; url?: string }[]) {
        const url = citation.url ?? "";
        const name = citation.name ?? "";

        // A backslash in a URL is always a markdown escape that survived.
        if (url.includes("\\")) {
          badUrls.push(`${where} → ${url}`);
        } else {
          try {
            new URL(url, "https://jmrp.io/");
          } catch {
            badUrls.push(`${where} → ${url} (does not parse)`);
          }
        }

        if (RAW_MARKDOWN.some((pattern) => pattern.test(name))) {
          badNames.push(`${where} → ${JSON.stringify(name)}`);
        }

        // The graph and the visible bibliography are built from one list, so a
        // citation URL that is not also an href means they have drifted apart.
        if (!hrefs.has(url)) orphanCitations.push(`${where} → ${url}`);
      }
    }

    expect(
      pagesWithCitations,
      "No post page published a citation array",
    ).toBeGreaterThan(0);
    expect(
      badUrls,
      `citation.url carrying a markdown escape or failing to parse:\n${badUrls.join("\n")}`,
    ).toEqual([]);
    expect(
      badNames,
      `citation.name carrying raw markdown emphasis — if the link text in the MDX has an UNPAIRED delimiter, fix the MDX; otherwise stripEmphasis in BlogPost.astro missed a form:\n${badNames.join("\n")}`,
    ).toEqual([]);
    expect(
      orphanCitations,
      `citation.url with no matching href in the page:\n${orphanCitations.join("\n")}`,
    ).toEqual([]);
    expect(
      emptyBibliographies,
      `pages rendering a bibliography with no citations:\n${emptyBibliographies.join("\n")}`,
    ).toEqual([]);
    expect(
      totalCitations,
      `The corpus published ${totalCitations} citations across ${pagesWithCitations} pages; a drop this large means reference extraction stopped matching something it used to match`,
    ).toBeGreaterThanOrEqual(MIN_TOTAL_CITATIONS);
  });
});
