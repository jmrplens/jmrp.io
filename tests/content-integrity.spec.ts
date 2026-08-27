/**
 * Content Integrity & Build Output Validation Tests
 *
 * Validates content quality, build output, and security requirements:
 * - Image alt text (accessibility)
 * - External link security (rel=noopener noreferrer, target=_blank)
 * - Build compression (Brotli and Gzip)
 * - Favicon files
 * - RSS feed completeness
 * - Sitemap completeness
 * - rel=me social verification links
 * - Meta description length compliance
 */

/* eslint-disable playwright/no-conditional-in-test -- Content checks require conditionals */
/* eslint-disable playwright/no-conditional-expect -- Conditional expects after null guards */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { blockCloudflare, getCachedPages, shouldIgnoreError } from "./utils";

const pages = getCachedPages();

// ─── Image Alt Text ──────────────────────────────────────────────────

test.describe("Image Alt Text Validation", () => {
  for (const pageInfo of pages) {
    test(`images have alt text on ${pageInfo.name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => {
        if (!shouldIgnoreError(error.message)) errors.push(error.message);
      });

      await blockCloudflare(page);
      await page.goto(pageInfo.url);

      const images = page.locator("img");
      const count = await images.count();

      for (let i = 0; i < count; i++) {
        const img = images.nth(i);
        const alt = await img.getAttribute("alt");
        const role = await img.getAttribute("role");
        const ariaHidden = await img.getAttribute("aria-hidden");

        // All images must have an alt attribute
        expect(
          alt,
          `Image ${i} on ${pageInfo.url} missing alt attribute`,
        ).not.toBeNull();

        // Non-decorative images must have non-empty alt
        const isDecorative = role === "presentation" || ariaHidden === "true";
        if (!isDecorative && alt === "") {
          const src = await img.getAttribute("src");
          expect
            .soft(
              alt,
              `Image (src: ${src}) has empty alt but is not decorative`,
            )
            .not.toBe("");
        }
      }

      expect(errors).toEqual([]);
    });
  }
});

// ─── External Links Security ─────────────────────────────────────────

test.describe("External Links Security", () => {
  // The sample missed the two page types that actually shipped bare external
  // anchors (2026-08-23): /about/, whose links are written by hand in the
  // component, and a tool page whose MDX writes raw HTML <a> — those reach the
  // tree as JSX and rehype-external-links never sees them. /uses/ is here for
  // the same reason as /about/. The other test that covers this
  // (functional.spec.ts) only inspects links that ALREADY have target="_blank",
  // so a link with neither attribute slipped through both.
  const samplePages = [
    "/",
    "/blog/001-secure-nginx-client-certificates/",
    "/cv",
    "/tools/",
    "/tools/etm-envelope-visualizer/",
    "/projects/",
    "/about/",
    "/uses/",
    // /feeds/ shipped the same defect from the other direction (2026-08-24):
    // its 16 Bluesky links carried the full rel but no target, so they were the
    // only external links on the site that did not open in a new tab. Nothing
    // caught it because the page was outside this sample.
    "/feeds/",
  ];

  for (const url of samplePages) {
    test(`external links have security attrs on ${url}`, async ({ page }) => {
      await blockCloudflare(page);
      await page.goto(url);

      const externalLinks = page.locator('a[href^="http"]');
      const count = await externalLinks.count();

      for (let i = 0; i < count; i++) {
        const link = externalLinks.nth(i);
        const href = await link.getAttribute("href");
        const rel = (await link.getAttribute("rel")) ?? "";

        // No exemption for rel="me": Footer.astro's normalizeExternalRel()
        // forces external+noopener+noreferrer on every social link while
        // keeping the `me` token, so all 378 of them already satisfy the three
        // assertions below. The skip that used to live here claimed they
        // "intentionally omit noopener/noreferrer" — untrue since that
        // normalizer landed, and it was a hole in the guard for free.

        expect(rel, `Link ${href} on ${url} missing noopener`).toContain(
          "noopener",
        );
        expect(rel, `Link ${href} on ${url} missing noreferrer`).toContain(
          "noreferrer",
        );
        await expect(
          link,
          `Link ${href} on ${url} missing target=_blank`,
        ).toHaveAttribute("target", "_blank");
      }
    });
  }
});

// ─── Opted-out Networks ──────────────────────────────────────────────

test.describe("Opted-out Networks", () => {
  // The author does not use X/Twitter or Ko-fi and does not want them named
  // anywhere on the site (closed decision, reaffirmed 2026-08-24). The existing
  // guard in schema-validation.spec.ts only inspects `sameAs` in the JSON-LD of
  // /about/, so it never saw the two <meta> tags BaseHead emitted on all 126
  // pages: twitter:site and twitter:creator, both carrying the handle. This
  // sweeps the whole build instead of a sample, because the leak was in a
  // layout — one page's worth of coverage would have proved nothing.
  //
  // The rest of the twitter:* namespace is deliberately NOT matched: Slack,
  // Discord and WhatsApp read twitter:card to pick the large-image layout, and
  // none of those tags names an account.
  test("no page names an opted-out network", () => {
    const distDir = join(process.cwd(), "dist");
    expect(existsSync(distDir)).toBe(true);

    // Host-anchored on purpose: a bare "x.com" substring also matches
    // docs.nginx.com and acusticox.com, both legitimately linked from posts.
    // The scheme is optional so protocol-relative hrefs (`//twitter.com/...`)
    // are caught too, and `(?![\w.-])` requires the host to END there: with
    // `\b` a following dot was enough to slip through, so `twitter.com.evil`
    // matched and would have failed the build over a legitimate link.
    const forbidden = [
      {
        label: "X/Twitter URL",
        re: /(?:https?:)?\/\/(?:[\w-]+\.)*(?:x|twitter)\.com(?![\w.-])/i,
      },
      {
        label: "Ko-fi URL",
        re: /(?:https?:)?\/\/(?:[\w-]+\.)*ko-fi\.com(?![\w.-])/i,
      },
      {
        label: "account handle meta",
        re: /<meta[^>]+name="twitter:(?:site|creator)"/i,
      },
    ];

    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith(".html")) {
          const html = readFileSync(full, "utf8");
          for (const { label, re } of forbidden) {
            if (re.test(html)) offenders.push(`${label} in ${full}`);
          }
        }
      }
    };
    walk(distDir);

    expect(offenders, offenders.slice(0, 10).join("\n")).toEqual([]);
  });
});

// ─── Build Compression ───────────────────────────────────────────────

test.describe("Build Compression", () => {
  test("JS files have Brotli and Gzip companions", () => {
    const astroDir = join(process.cwd(), "dist", "_astro");
    expect(existsSync(astroDir)).toBe(true);

    const files = readdirSync(astroDir);
    const jsFiles = files
      .filter((f) => f.endsWith(".js"))
      .sort((a, b) => a.localeCompare(b));

    expect(jsFiles.length).toBeGreaterThan(0);

    for (const jsFile of jsFiles) {
      const base = join(astroDir, jsFile);
      expect(existsSync(`${base}.br`), `Missing .br for ${jsFile}`).toBe(true);
      expect(existsSync(`${base}.gz`), `Missing .gz for ${jsFile}`).toBe(true);
    }
  });

  test("text assets have Brotli and Gzip companions", () => {
    const distDir = join(process.cwd(), "dist");
    const textAssets = ["rss.xml", "sitemap-index.xml", "llms.txt"];

    for (const asset of textAssets) {
      const base = join(distDir, asset);
      expect(existsSync(base), `Missing asset: ${asset}`).toBe(true);
      expect(existsSync(`${base}.br`), `Missing .br for ${asset}`).toBe(true);
      expect(existsSync(`${base}.gz`), `Missing .gz for ${asset}`).toBe(true);
    }
  });
});

// ─── Favicon Files ───────────────────────────────────────────────────

test.describe("Favicon Files", () => {
  test("required favicon files exist in dist", () => {
    const distDir = join(process.cwd(), "dist");
    // Every file hand-linked from BaseHead's <head> plus the RSS channel
    // image (favicon.png, src/utils/rss.ts) — these are static public/ URLs
    // with no build-time coupling, so this guard is what catches a deletion.
    const required = [
      "favicon.ico",
      "favicon.svg",
      "favicon-48x48.png",
      "favicon-32x32.png",
      "favicon.png",
      "apple-touch-icon.png",
    ];

    for (const file of required) {
      expect(existsSync(join(distDir, file)), `Missing: ${file}`).toBe(true);
    }
  });
});

// ─── RSS Completeness ────────────────────────────────────────────────

test.describe("RSS Feed Completeness", () => {
  test("RSS feed is valid and matches published posts", async ({ page }) => {
    await blockCloudflare(page);
    const response = await page.goto("/rss.xml");
    expect(response?.status()).toBe(200);

    const content = (await response?.text()) ?? "";
    expect(content).toContain("<?xml");
    expect(content).toContain("<channel>");
    expect(content).toContain("<title>");
    expect(content).toContain("<description>");

    // Each item has required elements
    expect(content).toMatch(/<item>[\s\S]*?<title>/);
    expect(content).toMatch(/<item>[\s\S]*?<link>/);
    expect(content).toMatch(/<item>[\s\S]*?<pubDate>/);

    // Count RSS items vs published posts
    const rssItems = content.split("<item>").length - 1;
    const postsDir = join(process.cwd(), "src", "content", "posts", "en");
    const postFiles = readdirSync(postsDir);
    const published = postFiles.filter((f) => {
      if (
        !f.endsWith(".mdx") ||
        f.startsWith("_") ||
        f.includes("999-testing-components")
      ) {
        return false;
      }
      // Exclude draft posts
      const content = readFileSync(join(postsDir, f), "utf-8");
      const draftMatch = /^draft:\s*true$/m.exec(content);
      return !draftMatch;
    });

    expect(rssItems, "RSS item count should match published posts").toBe(
      published.length,
    );
  });
});

// ─── Sitemap Completeness ────────────────────────────────────────────

test.describe("Sitemap Completeness", () => {
  test("sitemap contains all pages with loc and lastmod", async ({ page }) => {
    await blockCloudflare(page);

    const indexResp = await page.goto("/sitemap-index.xml");
    expect(indexResp?.status()).toBe(200);
    const indexContent = (await indexResp?.text()) ?? "";
    expect(indexContent).toContain("sitemapindex");

    // Extract sub-sitemap URL
    const sitemapMatch = /<loc>(.*?)<\/loc>/.exec(indexContent);
    expect(sitemapMatch).toBeTruthy();

    const sitemapResp = await page.goto(sitemapMatch![1]);
    expect(sitemapResp?.status()).toBe(200);
    const sitemapContent = (await sitemapResp?.text()) ?? "";

    // Count URL entries
    const locs = [...sitemapContent.matchAll(/<loc>(.*?)<\/loc>/g)];
    expect(locs.length).toBeGreaterThanOrEqual(50);

    // Each URL block has loc + lastmod with absolute URL
    const urlBlocks = sitemapContent.split("<url>").slice(1);
    for (const block of urlBlocks) {
      expect(block).toMatch(/<loc>https?:\/\//);
      expect(block).toMatch(/<lastmod>/);
    }
  });

  test("every post URL agrees with its own page on the revision date", async ({
    page,
  }) => {
    // `<lastmod>` and the page's `dateModified` are computed by the same
    // function (`@utils/post-dates`), but they travel by different routes: the
    // sitemap parses the MDX frontmatter itself from inside astro.config, while
    // the page reads the collection entry. This pins them together.
    //
    // The failure it guards against is per-locale, and was real: the sitemap's
    // map used to be keyed by SLUG, keeping the newest of the two
    // translations, so both /blog/<slug>/ and /es/blog/<slug>/ advertised one
    // date while each page published its own. It went unnoticed only while the
    // two locales shared hand-written frontmatter dates.
    await blockCloudflare(page);
    const sitemap = await (await page.request.get("/sitemap-0.xml")).text();

    const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)]
      .map((block) => ({
        loc: /<loc>(.*?)<\/loc>/.exec(block[1])?.[1] ?? "",
        lastmod: /<lastmod>(.*?)<\/lastmod>/.exec(block[1])?.[1] ?? "",
      }))
      .filter((entry) => /\/blog\/\d{3}-[a-z0-9-]+\/$/.test(entry.loc));

    expect(entries.length).toBeGreaterThanOrEqual(24);

    for (const entry of entries) {
      const path = new URL(entry.loc).pathname;
      const html = await (await page.request.get(path)).text();
      // Attribute order is not stable — the post-build minifier alphabetizes
      // them — so the type is matched anywhere inside the tag.
      const blocks = [
        ...html.matchAll(
          /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g,
        ),
      ];
      const nodes = blocks.flatMap((block) => {
        const parsed = JSON.parse(block[1]) as {
          "@graph"?: { "@type"?: string | string[]; dateModified?: string }[];
        };
        return parsed["@graph"] ?? [];
      });
      const article = nodes.find((node) =>
        [node["@type"] ?? []]
          .flat()
          .some((type) => /BlogPosting|TechArticle/.test(type)),
      );

      expect(
        article,
        `${path} has no article node in its JSON-LD`,
      ).toBeDefined();
      // Compared by day: both sides carry a full timestamp from the same
      // source, and pinning the millisecond would fail on a formatting change
      // without any date having drifted.
      expect(
        article?.dateModified?.slice(0, 10),
        `${path} publishes a dateModified its sitemap entry contradicts`,
      ).toBe(entry.lastmod.slice(0, 10));
    }
  });
});

// ─── rel=me Social Links ────────────────────────────────────────────

test.describe("Social Verification Links", () => {
  test("homepage has rel=me links for social profiles", async ({ page }) => {
    await blockCloudflare(page);
    await page.goto("/");

    const expectedProfiles = [
      { domain: "mstdn.jmrp.io", name: "Mastodon" },
      { domain: "github.com/jmrplens", name: "GitHub" },
      { domain: "linkedin.com/in/jmrplens", name: "LinkedIn" },
      { domain: "matrix.to", name: "Matrix" },
    ];

    for (const profile of expectedProfiles) {
      // rel=me links are <link> elements in <head>
      const link = page.locator(`link[rel="me"][href*="${profile.domain}"]`);
      await expect(link, `Missing rel="me" for ${profile.name}`).toHaveCount(1);
    }
  });

  test("ES homepage has rel=me links too", async ({ page }) => {
    await blockCloudflare(page);
    await page.goto("/es/");

    const meLinks = page.locator('link[rel="me"]');
    const count = await meLinks.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });
});

// ─── Meta Description Length ─────────────────────────────────────────

test.describe("Meta Description Length", () => {
  for (const pageInfo of pages) {
    test(`description ≤155 chars on ${pageInfo.name}`, async ({ page }) => {
      await blockCloudflare(page);
      await page.goto(pageInfo.url);

      const metaDesc = page.locator('meta[name="description"]');
      await expect(metaDesc).toHaveAttribute("content", /.+/);
      const content = await metaDesc.getAttribute("content");
      expect(
        content!.length,
        `Description on ${pageInfo.url} is ${content!.length} chars: "${content}"`,
      ).toBeLessThanOrEqual(155);
    });
  }
});

// ─── Locale Leaks in Spanish Content ─────────────────────────────────

test.describe("Spanish content links stay in Spanish", () => {
  const ES_DIRS = ["src/content/posts/es", "src/content/tools/es"];
  // Sections that exist in both locales, so a link to the bare form is a leak.
  // `/identity/`, `/og/`, `/pdf/` and the like are locale-less on purpose.
  const LOCALIZED = [
    "blog",
    "tools",
    "cv",
    "projects",
    "homelab",
    "publications",
    "about",
    "uses",
    "privacy",
    "feeds",
  ].join("|");

  for (const dir of ES_DIRS) {
    const root = join(process.cwd(), dir);
    if (!existsSync(root)) continue;

    const files = readdirSync(root).filter(
      (f) => f.endsWith(".mdx") && !f.startsWith("_") && !f.startsWith("999"),
    );
    for (const file of files) {
      test(`no unprefixed internal link in ${dir}/${file}`, () => {
        const body = readFileSync(join(root, file), "utf8");
        // Both markdown links and raw href attributes: this leaked through a
        // markdown link, and the same mistake in an `<a href>` is invisible to
        // a link checker because the English page answers 200.
        const leaks = [
          ...body.matchAll(
            new RegExp(String.raw`\]\((/(?:${LOCALIZED})/[^)]*)\)`, "g"),
          ),
          ...body.matchAll(
            new RegExp(`href=["'](/(?:${LOCALIZED})/[^"']*)["']`, "g"),
          ),
        ].map((m) => m[1]);

        expect(
          leaks,
          `${file} links to the English page for: ${leaks.join(", ")}`,
        ).toEqual([]);
      });
    }
  }
});
