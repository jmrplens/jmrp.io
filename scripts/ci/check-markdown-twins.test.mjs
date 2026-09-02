/**
 * Unit tests for the twin/announcement/index guard.
 *
 * The guard exists because audit #6 found three drifts of one missing check;
 * a guard that has never been SEEN to fail is the same class of vacuous check.
 * Every rule therefore gets a fixture that violates exactly it, and the test
 * asserts the message names the offending PATH.
 *
 * `makeSite()` builds a scale model of the real site in a temp dir: one page of
 * every class in PAGE_CLASSES, all of its literal paths, both locales, with a
 * sitemap and both llms indexes. The baseline must be clean — which also proves
 * the class table is satisfiable — and each test mutates exactly one thing.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { checkTwins, PAGE_CLASSES } from "./check-markdown-twins.mjs";

const ORIGIN = "https://jmrp.io";
const LASTMOD = "2026-08-28";
const PUBLISHED = "2026-01-01";

/** Minified-shaped page: attributes alphabetized, as the minifier leaves them. */
function html({
  twin,
  noindex = false,
  extraLinks = "",
  encoding = true,
  published = PUBLISHED,
}) {
  const robots = noindex ? "noindex, follow" : "index, follow";
  const graph = [
    {
      "@type": "WebPage",
      "@id": `${ORIGIN}/x#webpage`,
      datePublished: published,
    },
  ];
  if (twin && encoding) {
    graph[0].encoding = {
      "@type": "MediaObject",
      "@id": ORIGIN + twin,
      contentUrl: ORIGIN + twin,
      encodingFormat: "text/markdown",
      inLanguage: "en",
    };
  }
  return (
    `<!DOCTYPE html><html><head><meta content="${robots}" name="robots">` +
    (twin
      ? `<link href="${twin}" rel="alternate" title="This page as markdown" type="text/markdown">`
      : "") +
    extraLinks +
    `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script>` +
    `</head><body></body></html>`
  );
}

/** The other-language path of a page, the way the real site pairs them. */
function sibling(pagePath) {
  if (pagePath === "/") return "/es/";
  if (pagePath === "/es/") return "/";
  return pagePath.startsWith("/es/") ? pagePath.slice(3) : `/es${pagePath}`;
}

/** A twin body with the header fields every real twin carries. */
function twinBody(pagePath, { updated = LASTMOD } = {}) {
  return (
    `# Page\n\nCanonical: ${ORIGIN}${pagePath}\nLanguage: en\n` +
    `Alternate: ${ORIGIN}${sibling(pagePath)}index.md\n` +
    (updated === null ? "" : `Updated: ${updated}\n`)
  );
}

function write(dir, rel, body) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

/** Every path the literal-path classes claim, both locales. */
function literalPages() {
  const out = [];
  for (const entry of PAGE_CLASSES)
    if (entry.paths)
      for (const p of entry.paths) {
        out.push([p, entry]);
        if (entry.localized) out.push([p === "/" ? "/es/" : `/es${p}`, entry]);
      }
  return out;
}

/** Both locales of every pattern class, so the EN/ES mirror rule is satisfiable. */
const PATTERN_PAGES = [
  ["/blog/001-example/", "post"],
  ["/tools/regex-tester/", "tool"],
  ["/feeds/", "listing-twinned"],
  ["/blog/tags/nginx/", "tag"],
];

/**
 * Builds a minimal compliant site.
 *
 * @param {(site: object) => void} [mutate] - Applied before the indexes are written.
 * @returns {string} The dist dir.
 */
function makeSite(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "twins-"));
  const llms = [];
  const llmsFull = [];
  const urls = [];
  const add = (pagePath, entry) => {
    const twin = `${pagePath}index.md`;
    const wantsTwin = entry.twin === "required";
    const file =
      pagePath === "/404.html" ? "404.html" : `${pagePath.slice(1)}index.html`;
    write(
      dir,
      file,
      html({ twin: wantsTwin ? twin : null, noindex: entry.noindex === true }),
    );
    if (wantsTwin) {
      write(dir, twin.slice(1), twinBody(pagePath));
      urls.push(pagePath);
    }
    if (entry.llms === "twin") llms.push(ORIGIN + twin);
    else if (entry.llms === "page") llms.push(ORIGIN + pagePath);
    if (entry.llmsFull === "twin") llmsFull.push(ORIGIN + twin);
  };
  const classOf = (id) => PAGE_CLASSES.find((entry) => entry.id === id);
  for (const [p, entry] of literalPages()) add(p, entry);
  for (const [p, id] of PATTERN_PAGES) {
    add(p, classOf(id));
    add(sibling(p), classOf(id));
  }

  const site = { dir, llms, llmsFull, urls };
  mutate?.(site);
  write(dir, "llms.txt", site.llms.map((u) => `- (${u})`).join("\n"));
  write(
    dir,
    "llms-full.txt",
    site.llmsFull.map((u) => `Markdown: ${u}`).join("\n"),
  );
  write(
    dir,
    "sitemap-0.xml",
    `<urlset>${site.urls
      .map(
        (p) =>
          `<url><loc>${ORIGIN}${p}</loc><lastmod>${LASTMOD}T00:00:00.000Z</lastmod></url>`,
      )
      .join("")}</urlset>`,
  );
  return dir;
}

const run = (dir) => checkTwins(dir).violations;
const has = (violations, needle) => violations.some((v) => v.includes(needle));

test("baseline: a compliant site produces no violations", () => {
  assert.deepEqual(run(makeSite()), []);
});

test("twin with no <link> is reported by path (A2)", () => {
  const dir = makeSite(({ dir }) => {
    write(dir, "about/index.html", html({ twin: null }));
    write(dir, "about/index.md", twinBody("/about/"));
  });
  assert.ok(has(run(dir), "/about/ has a twin served at /about/index.md"));
});

test("attribute order and case do not matter (the minifier alphabetizes)", () => {
  const dir = makeSite(({ dir }) => {
    fs.writeFileSync(
      path.join(dir, "about/index.html"),
      html({ twin: "/about/index.md" }).replace(
        /<link href="\/about\/index\.md"[^>]*>/,
        '<LINK TYPE="TEXT/MARKDOWN" REL="ALTERNATE" HREF="/about/index.md">',
      ),
    );
  });
  assert.deepEqual(run(dir), []);
});

test("a <link> pointing at the wrong twin is caught", () => {
  const dir = makeSite(({ dir }) => {
    write(dir, "about/index.html", html({ twin: "/cv/index.md" }));
  });
  assert.ok(
    has(
      run(dir),
      "/about/ announces /cv/index.md but its twin is /about/index.md",
    ),
  );
});

test("a twin with no encoding node in the graph is caught (M8)", () => {
  const dir = makeSite(({ dir }) => {
    write(
      dir,
      "about/index.html",
      html({ twin: "/about/index.md", encoding: false }),
    );
  });
  assert.ok(
    has(
      run(dir),
      "/about/ has a twin but its JSON-LD declares no encoding node",
    ),
  );
});

test("a twin absent from llms.txt is caught (M5)", () => {
  const dir = makeSite((site) => {
    site.llms = site.llms.filter((u) => !u.endsWith("/about/index.md"));
  });
  assert.ok(has(run(dir), "/about/index.md is not listed in llms.txt"));
});

test("a twin absent from llms-full.txt is caught (M5b)", () => {
  const dir = makeSite((site) => {
    site.llmsFull = site.llmsFull.filter((u) => !u.endsWith("/about/index.md"));
  });
  assert.ok(has(run(dir), "/about/index.md is not listed in llms-full.txt"));
});

test("an orphan twin with no page is caught", () => {
  const dir = makeSite(({ dir }) => {
    write(dir, "ghost/index.md", twinBody("/ghost/"));
  });
  assert.ok(has(run(dir), "orphan twin /ghost/index.md"));
});

test("a page of a twin-required class with no twin is caught", () => {
  const dir = makeSite(({ dir }) => {
    fs.rmSync(path.join(dir, "about/index.md"));
    write(dir, "about/index.html", html({ twin: null }));
  });
  assert.ok(has(run(dir), "/about/ [singleton] has no markdown twin"));
});

test("a brand-new page type that skips twins trips the guard", () => {
  const dir = makeSite(({ dir }) => {
    write(dir, "notes/index.html", html({ twin: null }));
  });
  assert.ok(has(run(dir), "unclassified page /notes/"));
});

test("a <link> announcing a file that was not built is caught", () => {
  // On a twin-required class the "has no twin" message is the actionable one,
  // so this rule is exercised where no twin is expected at all: a page that
  // advertises markdown it does not have is advertising a 404.
  const dir = makeSite(({ dir }) => {
    write(
      dir,
      "blog/tags/nginx/index.html",
      html({ twin: "/blog/tags/nginx/index.md", noindex: true }),
    );
  });
  assert.ok(
    has(
      run(dir),
      "/blog/tags/nginx/ announces markdown alternate /blog/tags/nginx/index.md, but no such file was built",
    ),
  );
});

test("a stale class entry (page removed) is caught", () => {
  const dir = makeSite(({ dir }) => {
    fs.rmSync(path.join(dir, "uses"), { recursive: true });
  });
  assert.ok(has(run(dir), "names /uses/, which the build does not contain"));
});

test("a twin-exempt noindex class that stops being noindex is caught", () => {
  const dir = makeSite(({ dir }) => {
    write(
      dir,
      "blog/tags/nginx/index.html",
      html({ twin: null, noindex: false }),
    );
  });
  assert.ok(
    has(
      run(dir),
      "/blog/tags/nginx/ [tag] is exempt from twins because it is noindex, but it is NOT noindex",
    ),
  );
});

test("a bare listing that falls out of llms.txt is caught", () => {
  const dir = makeSite((site) => {
    site.llms = site.llms.filter((u) => u !== `${ORIGIN}/blog/`);
  });
  assert.ok(
    has(
      run(dir),
      "/blog/ [listing-bare] has no twin and is not listed in llms.txt",
    ),
  );
});

test("llms.txt listing a twin that was not built is caught", () => {
  const dir = makeSite((site) => {
    site.llms.push(`${ORIGIN}/gone/index.md`);
  });
  assert.ok(has(run(dir), "an index file lists /gone/index.md"));
});

test("a markdown file that is not <page>/index.md is caught", () => {
  const dir = makeSite(({ dir }) => {
    write(dir, "about/notes.md", "# stray\n");
  });
  assert.ok(has(run(dir), "unknown markdown artifact /about/notes.md"));
});

test("two markdown alternates on one page is caught", () => {
  const dir = makeSite(({ dir }) => {
    write(
      dir,
      "about/index.html",
      html({
        twin: "/about/index.md",
        extraLinks:
          '<link href="/cv/index.md" rel="alternate" type="text/markdown">',
      }),
    );
  });
  assert.ok(has(run(dir), "/about/ declares 2 markdown alternates"));
});

test("a bare listing that grows a twin must be reclassified", () => {
  const dir = makeSite(({ dir }) => {
    write(dir, "blog/index.md", twinBody("/blog/"));
  });
  assert.ok(
    has(run(dir), "/blog/ [listing-bare] has a twin the class forbids"),
  );
});

test("an empty or stub twin does not satisfy 'the twin exists'", () => {
  const dir = makeSite(({ dir }) => {
    write(dir, "about/index.md", "");
  });
  assert.ok(
    has(run(dir), "/about/index.md does not start with a level-1 heading"),
  );
});

test("a twin that names another page as its canonical is caught", () => {
  const dir = makeSite(({ dir }) => {
    write(dir, "about/index.md", twinBody("/cv/"));
  });
  assert.ok(
    has(
      run(dir),
      `/about/index.md does not declare "Canonical: ${ORIGIN}/about/"`,
    ),
  );
});

test("a locale losing its page breaks the mirror and is caught", () => {
  const dir = makeSite(({ dir }) => {
    fs.rmSync(path.join(dir, "es/blog/001-example"), { recursive: true });
  });
  const violations = run(dir);
  assert.ok(
    has(
      violations,
      "/blog/001-example/index.md points at /es/blog/001-example/index.md as its other-language twin",
    ),
  );
});

test("a twin dated differently from the sitemap is caught (A3)", () => {
  const dir = makeSite(({ dir }) => {
    write(
      dir,
      "blog/001-example/index.md",
      twinBody("/blog/001-example/", { updated: "2026-08-02" }),
    );
  });
  assert.ok(
    has(
      run(dir),
      '/blog/001-example/index.md prints "Updated: 2026-08-02" but the sitemap dates',
    ),
  );
});

test("a revised post whose twin prints no Updated line is caught (A3)", () => {
  const dir = makeSite(({ dir }) => {
    write(
      dir,
      "blog/001-example/index.md",
      twinBody("/blog/001-example/", { updated: null }),
    );
  });
  assert.ok(
    has(run(dir), '/blog/001-example/index.md prints no "Updated:" line'),
  );
});

test("a non-post twin may omit Updated (the homelab twin dates itself live)", () => {
  const dir = makeSite(({ dir }) => {
    write(dir, "homelab/index.md", twinBody("/homelab/", { updated: null }));
  });
  assert.deepEqual(run(dir), []);
});

test("a third-party /index.md cited in a post does not turn the build red", () => {
  // llms-full.txt reproduces post prose, so it carries foreign URLs. One of
  // them ending in /index.md must not be read as a claim about this build.
  const dir = makeSite((site) => {
    site.llmsFull.push("https://mcp.jmrp.io/gitlab/index.md");
  });
  assert.deepEqual(run(dir), []);
});

test("a foreign URL cannot vouch for a local twin of the same path", () => {
  const dir = makeSite((site) => {
    site.llms = site.llms.map((u) =>
      u === `${ORIGIN}/about/index.md`
        ? "https://mcp.jmrp.io/about/index.md"
        : u,
    );
  });
  assert.ok(has(run(dir), "/about/index.md is not listed in llms.txt"));
});

test("a twinned page missing from the sitemap is caught", () => {
  const dir = makeSite((site) => {
    site.urls = site.urls.filter((p) => p !== "/about/");
  });
  assert.ok(has(run(dir), "/about/ has a twin but no sitemap entry"));
});

test("a class that owns a twin but stops owing an index is rejected", () => {
  const entry = PAGE_CLASSES.find((c) => c.id === "listing-twinned");
  const original = entry.llmsFull;
  entry.llmsFull = "none";
  try {
    assert.ok(
      has(
        run(makeSite()),
        'PAGE_CLASSES entry "listing-twinned" is inconsistent',
      ),
    );
  } finally {
    entry.llmsFull = original;
  }
});

test("a missing index file is a crash, not a drift report", () => {
  const dir = makeSite();
  fs.rmSync(path.join(dir, "llms.txt"));
  assert.throws(() => checkTwins(dir), /llms\.txt is missing/);
});
