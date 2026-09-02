/**
 * Markdown-twin / announcement / index drift guard
 *
 * Four surfaces have to agree about every page of this site, and until now
 * nothing checked that they did:
 *
 *   1. the built page          `<dist>/<path>/index.html`
 *   2. its markdown twin       `<dist>/<path>/index.md`
 *   3. the announcements       `<link rel="alternate" type="text/markdown">`
 *      in the page head, and the `encoding` node in the page's JSON-LD
 *   4. the indexes             `/llms.txt`, `/llms-full.txt`, `/sitemap-0.xml`
 *
 * GEO audit #6 found the same missing verification manifest as three separate
 * drifts (A2, M5, M8): 20 twins served 200 with no `<link>`, no `encoding`
 * node and — for 10 of them — no mention in `llms.txt` at all. None of those
 * is detectable by any existing check, so all three would come back.
 *
 * The guard is a CLOSURE check, not an allowlist. Every built page must match
 * exactly one entry of `PAGE_CLASSES`, and each class states, as data and with
 * a reason, what that kind of page owes: a twin or not, an entry in `llms.txt`
 * by twin URL or by HTML URL or neither. A page that matches no class is a
 * FAILURE — that is the tripwire for "someone added a page type that quietly
 * skips twins". A class that matches no page is also a failure, so the table
 * cannot rot into a list of exemptions for pages that no longer exist. The
 * table is itself checked for internal consistency, so a class cannot quietly
 * be downgraded to "owes nothing" while still claiming to own a twin.
 *
 * Reads only the built output, so it measures exactly what production serves
 * (the HTML minifier ALPHABETIZES attributes — every parser here is attribute
 * order agnostic for that reason).
 *
 * Run manually: `node scripts/ci/check-markdown-twins.mjs [distDir]`
 * Wired into `astro:build:done` (src/integrations/post-build.ts), so a drift
 * fails the build BEFORE deploy-swap.mjs retargets the `dist` symlink.
 *
 * Exit codes: 0 clean · 1 drift found (paths listed) · 2 the guard itself
 * could not run (missing index file, unreadable build).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The only origin whose URLs describe THIS build.
 *
 * `llms-full.txt` is a corpus digest: it reproduces post prose, so it carries
 * roughly forty third-party URLs (mcp.jmrp.io, github.com, ietf.org and so
 * on).
 * Those are citations, not claims about this build, and mcp.jmrp.io publishes
 * markdown twins of its own — matching on pathname alone would let an external
 * `…/index.md` either fail this build or vouch for a local twin that is absent.
 */
export const SITE_ORIGIN = "https://jmrp.io";

/**
 * What each kind of page owes the four surfaces.
 *
 * `twin`:        "required" | "forbidden"
 * `llms`:        "twin" (listed by its .md URL) | "page" (by its HTML URL)
 *                | "none"
 * `llmsFull`:    "twin" | "none"
 * `updatedLine`: "required" — the twin must print `Updated:` whenever the page
 *                has been revised since publication. Omitted elsewhere: a twin
 *                MAY omit the line (the homelab twin prints a live capture
 *                timestamp instead), but if it prints one it must be right.
 * `noindex`:     the exemption rests on the page being noindex, and that is
 *                verified against the page's own robots meta.
 */
export const PAGE_CLASSES = [
  {
    id: "post",
    pattern: /^\/(?:es\/)?blog\/\d{3}-[^/]+\/$/,
    twin: "required",
    llms: "twin",
    llmsFull: "twin",
    updatedLine: "required",
    reason: "Blog articles: the corpus AI agents are here for.",
  },
  {
    id: "tool",
    pattern: /^\/(?:es\/)?tools\/(?!categories\/)[^/]+\/$/,
    twin: "required",
    llms: "twin",
    llmsFull: "twin",
    reason: "Interactive tool pages: documented in both indexes.",
  },
  {
    id: "singleton",
    paths: [
      "/",
      "/about/",
      "/cv/",
      "/homelab/",
      "/license/",
      "/privacy/",
      "/projects/",
      "/publications/",
      "/uses/",
    ],
    localized: true,
    twin: "required",
    llms: "twin",
    llmsFull: "twin",
    reason:
      "Standalone prose/profile pages. Each twin is a hand-written route " +
      "(src/pages/<page>/index.md.ts, one per locale) — nothing generates one " +
      "for a new page — so a NEW page of this kind must be an explicit " +
      "decision here, not a silent skip. See the remedy in the failure text.",
  },
  {
    id: "listing-twinned",
    pattern:
      /^\/(?:es\/)?(?:blog\/series\/(?:[^/]+\/)?|tools\/categories\/[^/]+\/|feeds\/)$/,
    twin: "required",
    llms: "twin",
    llmsFull: "twin",
    reason:
      "Listing hubs that carry prose of their own (reading order, category " +
      "context, feed inventory). They own a twin, so they owe both indexes " +
      "exactly like any other twinned page.",
  },
  {
    id: "listing-bare",
    paths: ["/blog/", "/tools/"],
    localized: true,
    twin: "forbidden",
    llms: "page",
    llmsFull: "none",
    reason:
      "Pure listings with no prose of their own. Audit #5's remediation " +
      "excluded them deliberately: llms.txt already publishes the same list, " +
      "so a twin would duplicate it. That reason carries an obligation — they " +
      "must still be reachable in llms.txt by their HTML URL.",
  },
  {
    id: "tag",
    pattern: /^\/(?:es\/)?blog\/tags\/[^/]+\/$/,
    twin: "forbidden",
    llms: "none",
    llmsFull: "none",
    noindex: true,
    reason:
      "Tag listings are noindex: excluded from every index surface on " +
      "purpose, so there is no discoverability to lose.",
  },
  {
    id: "not-found",
    paths: ["/404.html", "/es/404/"],
    twin: "forbidden",
    llms: "none",
    llmsFull: "none",
    noindex: true,
    reason: "Error pages, noindex.",
  },
];

/**
 * The two-line remedy printed with an unclassified-page failure.
 *
 * A guard that says "no" without saying "then do this" is how a correct check
 * gets deleted by the next person in a hurry.
 */
const REMEDY =
  "  A new page owes a decision, not a silent skip:\n" +
  "    · a prose page like /uses/ → write src/pages/<page>/index.md.ts AND\n" +
  "      src/pages/es/<page>/index.md.ts, then add the path to the\n" +
  '      "singleton" entry of PAGE_CLASSES;\n' +
  "    · a new route SHAPE (e.g. /notes/<slug>/) → add a new PAGE_CLASSES\n" +
  "      entry with a `pattern` and a written `reason`;\n" +
  '    · a page that must NOT have a twin → add it with twin: "forbidden"\n' +
  '      and say why, and state where it IS discoverable (llms: "page").';

/**
 * Expands a class's `paths`, adding the `/es/` twin of each when `localized`.
 *
 * @param {object} pageClass - One PAGE_CLASSES entry.
 * @returns {string[]} Every literal path the class claims.
 */
function literalPaths(pageClass) {
  if (!pageClass.paths) return [];
  if (!pageClass.localized) return pageClass.paths;
  return pageClass.paths.flatMap((p) => [p, p === "/" ? "/es/" : `/es${p}`]);
}

/**
 * Walks a directory tree collecting files with the given extension.
 *
 * @param {string} root - Directory to walk.
 * @param {string} ext - Extension including the dot.
 * @returns {string[]} Absolute file paths.
 */
function walk(root, ext) {
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, ext));
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

/** `<dist>/a/b/index.html` -> `/a/b/`; `<dist>/404.html` -> `/404.html`. */
export function pagePathOf(distDir, file) {
  const rel = `/${path.relative(distDir, file).split(path.sep).join("/")}`;
  return rel.endsWith("/index.html") ? rel.slice(0, -"index.html".length) : rel;
}

/**
 * Every `<link>` tag that announces a markdown alternate.
 *
 * Attribute order agnostic: the HTML minifier alphabetizes attributes, so a
 * regex anchored on `rel` coming first matches nothing on any page.
 *
 * @param {string} html - Page source.
 * @returns {string[]} The `href` of each matching link, in document order.
 */
export function markdownLinkHrefs(html) {
  /** @type {string[]} */
  const hrefs = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    /** @type {Record<string, string>} */
    const attrs = {};
    for (const m of tag.matchAll(/([a-zA-Z-]+)\s*=\s*"([^"]*)"/g))
      attrs[m[1].toLowerCase()] = m[2];
    const rel = (attrs.rel ?? "").toLowerCase().split(/\s+/);
    const type = (attrs.type ?? "").toLowerCase().split(";", 1)[0].trim();
    if (rel.includes("alternate") && type === "text/markdown" && attrs.href)
      hrefs.push(attrs.href);
  }
  return hrefs;
}

/**
 * Every `encoding.contentUrl` declared as `text/markdown` in the page graph.
 *
 * @param {string} html - Page source.
 * @returns {string[]} Content URLs, in graph order.
 */
export function markdownEncodingUrls(html) {
  /** @type {string[]} */
  const urls = [];
  for (const node of jsonLdNodes(html)) {
    const encoding = node.encoding;
    if (encoding?.encodingFormat === "text/markdown" && encoding.contentUrl)
      urls.push(encoding.contentUrl);
  }
  return urls;
}

/**
 * Every object node of every JSON-LD block on the page.
 *
 * @param {string} html - Page source.
 * @yields {Record<string, unknown>} One graph node at a time.
 */
function* jsonLdNodes(html) {
  const scripts = html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const script of scripts) {
    let data;
    try {
      data = JSON.parse(script[1]);
    } catch {
      continue;
    }
    const stack = [data];
    while (stack.length > 0) {
      const node = stack.pop();
      if (Array.isArray(node)) stack.push(...node);
      else if (node && typeof node === "object") {
        yield node;
        stack.push(...Object.values(node));
      }
    }
  }
}

/**
 * The `datePublished` (day part) the page's own article node declares.
 *
 * @param {string} html - Page source.
 * @returns {string | null} `YYYY-MM-DD`, or null when the page declares none.
 */
export function publishedDay(html) {
  for (const node of jsonLdNodes(html))
    if (typeof node.datePublished === "string")
      return node.datePublished.slice(0, 10);
  return null;
}

/**
 * The root-relative paths an index file mentions as URLs of THIS site.
 *
 * Compared as whole pathnames, never as substrings: `/index.md` is a suffix
 * of `/about/index.md`, so a substring test would report the home twin as
 * listed no matter what. Foreign origins are dropped — see SITE_ORIGIN.
 *
 * @param {string} text - File body.
 * @returns {Set<string>} Pathnames.
 */
export function listedPaths(text) {
  /** @type {Set<string>} */
  const paths = new Set();
  for (const raw of text.match(/https?:\/\/[^\s<>"')\]]+/g) ?? []) {
    try {
      const url = new URL(raw.replace(/[.,;:]+$/, ""));
      if (url.origin === SITE_ORIGIN) paths.add(url.pathname);
    } catch {
      /* not a URL after trimming */
    }
  }
  return paths;
}

/**
 * `<loc>` -> `<lastmod>` day, for this site's own sitemap entries.
 *
 * @param {string} xml - Sitemap body.
 * @returns {Map<string, string | null>} pathname -> `YYYY-MM-DD` or null.
 */
export function parseSitemapDates(xml) {
  /** @type {Map<string, string | null>} */
  const sitemapDates = new Map();
  const entries = xml.matchAll(
    /<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g,
  );
  for (const entry of entries) {
    try {
      const url = new URL(entry[1]);
      if (url.origin === SITE_ORIGIN)
        sitemapDates.set(url.pathname, entry[2]?.slice(0, 10) ?? null);
    } catch {
      /* malformed <loc>, reported by the RSS/sitemap checks, not here */
    }
  }
  return sitemapDates;
}

/** Normalizes an announced href to a root-relative path. */
function toPath(href) {
  try {
    return new URL(href, SITE_ORIGIN).pathname;
  } catch {
    return href;
  }
}

/** Sorts paths deterministically for stable, reviewable output. */
const byPath = (a, b) => a.localeCompare(b);

/**
 * Rejects a PAGE_CLASSES table that contradicts itself.
 *
 * Owning a twin and owing the indexes are the same fact. Without this, a class
 * can be quietly downgraded to `llmsFull: "none"` and the surface it stops
 * checking is exactly the one audit #6 found broken.
 *
 * @param {string[]} violations - Sink for problems found.
 * @returns {void}
 */
function checkClassTable(violations) {
  for (const pageClass of PAGE_CLASSES) {
    const owed = pageClass.twin === "required";
    const claims = pageClass.llms === "twin" && pageClass.llmsFull === "twin";
    if (owed !== claims)
      violations.push(
        `PAGE_CLASSES entry "${pageClass.id}" is inconsistent: twin ` +
          `"${pageClass.twin}" but llms "${pageClass.llms}" / llmsFull ` +
          `"${pageClass.llmsFull}" — a class that owns a twin owes both indexes`,
      );
    if (!pageClass.reason)
      violations.push(
        `PAGE_CLASSES entry "${pageClass.id}" has no stated reason`,
      );
  }
}

/**
 * Collects the built pages, keyed by their public path.
 *
 * @param {string} distDir - Directory to check.
 * @returns {Map<string, string>} public path -> absolute file.
 */
function collectPages(distDir) {
  return new Map(
    walk(distDir, ".html").map((file) => [pagePathOf(distDir, file), file]),
  );
}

/**
 * Collects the markdown twins, rejecting anything that is not `<page>/index.md`.
 *
 * @param {string} distDir - Directory to check.
 * @param {string[]} violations - Sink for problems found.
 * @returns {Set<string>} Twin paths.
 */
function collectTwins(distDir, violations) {
  /** @type {Set<string>} */
  const twins = new Set();
  for (const file of walk(distDir, ".md")) {
    const rel = `/${path.relative(distDir, file).split(path.sep).join("/")}`;
    if (rel.endsWith("/index.md")) twins.add(rel);
    else
      violations.push(
        `unknown markdown artifact ${rel} — twins are always <page>/index.md`,
      );
  }
  return twins;
}

/**
 * Assigns every page exactly one class, or reports why it could not.
 *
 * @param {Map<string, string>} pages - Built pages.
 * @param {string[]} violations - Sink for problems found.
 * @returns {{ classOf: Map<string, object>, matched: Map<string, number> }} Result.
 */
function classifyPages(pages, violations) {
  const classOf = new Map();
  const matched = new Map(PAGE_CLASSES.map((entry) => [entry.id, 0]));
  for (const pagePath of [...pages.keys()].sort(byPath)) {
    const hits = PAGE_CLASSES.filter(
      (entry) =>
        literalPaths(entry).includes(pagePath) ||
        (entry.pattern?.test(pagePath) ?? false),
    );
    if (hits.length === 0) {
      violations.push(
        `unclassified page ${pagePath} — no PAGE_CLASSES entry claims it`,
      );
    } else if (hits.length > 1) {
      violations.push(
        `page ${pagePath} matches ${hits.length} classes ` +
          `(${hits.map((hit) => hit.id).join(", ")}) — classes must be disjoint`,
      );
    } else {
      classOf.set(pagePath, hits[0]);
      matched.set(hits[0].id, matched.get(hits[0].id) + 1);
    }
  }
  return { classOf, matched };
}

/**
 * Rejects a class table that has rotted: an entry nothing matches, or a
 * literal path the build no longer contains.
 *
 * @param {Map<string, string>} pages - Built pages.
 * @param {Map<string, number>} matched - Pages matched per class id.
 * @param {string[]} violations - Sink for problems found.
 * @returns {void}
 */
function checkTableHygiene(pages, matched, violations) {
  for (const pageClass of PAGE_CLASSES) {
    if (matched.get(pageClass.id) === 0)
      violations.push(
        `PAGE_CLASSES entry "${pageClass.id}" matched no page — stale exemption, remove it`,
      );
    for (const literal of literalPaths(pageClass))
      if (!pages.has(literal))
        violations.push(
          `PAGE_CLASSES entry "${pageClass.id}" names ${literal}, which the build does not contain`,
        );
  }
}

/**
 * Checks that a page which HAS a twin announces it in both machine surfaces.
 *
 * @param {object} page - Page under test.
 * @param {string[]} violations - Sink for problems found.
 * @returns {void}
 */
function checkAnnouncements({ pagePath, twin, hrefs, encodings }, violations) {
  if (hrefs.length === 0)
    violations.push(
      `${pagePath} has a twin served at ${twin} but its HTML declares no ` +
        `<link rel="alternate" type="text/markdown">`,
    );
  else if (hrefs.length > 1)
    violations.push(
      `${pagePath} declares ${hrefs.length} markdown alternates ` +
        `(${hrefs.join(", ")}) — exactly one is allowed`,
    );
  else if (hrefs[0] !== twin)
    violations.push(
      `${pagePath} announces ${hrefs[0]} but its twin is ${twin}`,
    );

  if (encodings.length === 0)
    violations.push(
      `${pagePath} has a twin but its JSON-LD declares no encoding node with ` +
        `encodingFormat "text/markdown"`,
    );
  else if (!encodings.includes(twin))
    violations.push(
      `${pagePath} JSON-LD encoding points at ${encodings.join(", ")}, not ${twin}`,
    );
}

/**
 * Checks a page with NO twin: it must not advertise one, and if its class says
 * the exemption rests on `noindex`, it must really be noindex.
 *
 * @param {object} page - Page under test.
 * @param {string[]} violations - Sink for problems found.
 * @returns {void}
 */
function checkMissingTwin(
  { pagePath, pageClass, hrefs, encodings, html },
  violations,
) {
  for (const href of hrefs)
    violations.push(
      `${pagePath} announces markdown alternate ${href}, but no such file was ` +
        `built (404 announced)`,
    );
  for (const url of encodings)
    violations.push(
      `${pagePath} JSON-LD declares an encoding at ${url}, but no such file was built`,
    );
  if (pageClass.noindex !== true) return;
  const isNoindex = (html.match(/<meta\b[^>]*>/gi) ?? []).some(
    (tag) => /name="robots"/i.test(tag) && /content="[^"]*noindex/i.test(tag),
  );
  if (!isNoindex)
    violations.push(
      `${pagePath} [${pageClass.id}] is exempt from twins because it is ` +
        `noindex, but it is NOT noindex`,
    );
}

/**
 * Checks the index-file obligations a class declares.
 *
 * @param {object} page - Page under test.
 * @param {object} indexes - Parsed index surfaces.
 * @param {string[]} violations - Sink for problems found.
 * @returns {void}
 */
function checkIndexes({ pagePath, pageClass, twin }, indexes, violations) {
  const { llms, llmsFull, sitemapDates } = indexes;
  if (pageClass.llms === "twin" && !llms.has(twin))
    violations.push(`${twin} is not listed in llms.txt`);
  if (pageClass.llms === "page" && !llms.has(pagePath))
    violations.push(
      `${pagePath} [${pageClass.id}] has no twin and is not listed in ` +
        `llms.txt by its HTML URL either — it is invisible`,
    );
  if (pageClass.llmsFull === "twin" && !llmsFull.has(twin))
    violations.push(`${twin} is not listed in llms-full.txt`);
  if (pageClass.twin === "required" && !sitemapDates.has(pagePath))
    violations.push(
      `${pagePath} has a twin but no sitemap entry — nothing can date it`,
    );
}

/**
 * Checks the twin's own body: that it is a real document, that it names the
 * page it belongs to, that it points at its other-language sibling, and that
 * the date it prints is the date every other surface prints.
 *
 * The `Updated:` line is compared against the sitemap `<lastmod>` because that
 * is the site's single canonical "when did this change" value per URL. A page's
 * JSON-LD is NOT usable as the reference: a tool page carries two dateModified
 * nodes (SoftwareApplication from frontmatter, WebPage from the derived date)
 * and picking either one by graph order is a coin toss.
 *
 * @param {object} page - Page under test.
 * @param {object} context - `twins`, `sitemapDates` and the twin body.
 * @param {string[]} violations - Sink for problems found.
 * @returns {void}
 */
function checkTwinBody(
  { pagePath, pageClass, twin, html },
  context,
  violations,
) {
  const { body, twins, sitemapDates } = context;
  if (!body.startsWith("# "))
    violations.push(
      `${twin} does not start with a level-1 heading — an empty or stub twin ` +
        `satisfies "the file exists" and nothing else`,
    );
  if (!new RegExp(`^URL: ${SITE_ORIGIN}${pagePath}$`, "m").test(body))
    violations.push(
      `${twin} does not declare "URL: ${SITE_ORIGIN}${pagePath}" — it is not ` +
        `the twin of the page that serves it`,
    );

  const alternate = body.match(/^Alternate: (\S+)/m)?.[1];
  if (alternate) {
    const sibling = toPath(alternate);
    if (!twins.has(sibling))
      violations.push(
        `${twin} points at ${sibling} as its other-language twin, but that ` +
          `file was not built — the EN/ES mirror is broken`,
      );
  } else violations.push(`${twin} declares no "Alternate:" sibling twin`);

  const printed = body.match(/^Updated: (\S+)/m)?.[1] ?? null;
  const lastmod = sitemapDates.get(pagePath) ?? null;
  if (printed !== null && lastmod !== null && printed !== lastmod)
    violations.push(
      `${twin} prints "Updated: ${printed}" but the sitemap dates ${pagePath} ` +
        `${lastmod} — the twin and the page disagree about their own date`,
    );
  if (pageClass.updatedLine !== "required" || printed !== null) return;
  const published = publishedDay(html);
  if (lastmod !== null && published !== null && lastmod > published)
    violations.push(
      `${twin} prints no "Updated:" line, but ${pagePath} was published ` +
        `${published} and last modified ${lastmod}`,
    );
}

/**
 * Reads the three index surfaces. A missing one is fatal, not a drift: the
 * guard cannot answer the question it was asked.
 *
 * @param {string} distDir - Directory to check.
 * @returns {{ llms: Set<string>, llmsFull: Set<string>, sitemapDates: Map<string, string|null> }} Parsed indexes.
 */
function readIndexes(distDir) {
  const read = (name) => {
    const file = path.join(distDir, name);
    if (!fs.existsSync(file))
      throw new Error(`${name} is missing from ${distDir} — build incomplete`);
    return fs.readFileSync(file, "utf8");
  };
  return {
    llms: listedPaths(read("llms.txt")),
    llmsFull: listedPaths(read("llms-full.txt")),
    sitemapDates: parseSitemapDates(read("sitemap-0.xml")),
  };
}

/**
 * Runs every rule against a built directory.
 *
 * @param {string} distDir - Directory to check (an `astro build --outDir`).
 * @returns {{ violations: string[], stats: Record<string, number> }} Result.
 */
export function checkTwins(distDir) {
  /** @type {string[]} */
  const violations = [];
  const pages = collectPages(distDir);
  const twins = collectTwins(distDir, violations);
  const indexes = readIndexes(distDir);

  checkClassTable(violations);
  const { classOf, matched } = classifyPages(pages, violations);
  checkTableHygiene(pages, matched, violations);

  for (const twin of [...twins].sort(byPath)) {
    const page = twin.slice(0, -"index.md".length);
    if (!pages.has(page))
      violations.push(`orphan twin ${twin} — no ${page}index.html was built`);
  }

  for (const pagePath of [...pages.keys()].sort(byPath)) {
    const pageClass = classOf.get(pagePath);
    if (!pageClass) continue;
    const twin = `${pagePath}index.md`;
    const hasTwin = twins.has(twin);
    const html = fs.readFileSync(pages.get(pagePath), "utf8");
    const page = {
      pagePath,
      pageClass,
      twin,
      html,
      hrefs: markdownLinkHrefs(html).map((href) => toPath(href)),
      encodings: markdownEncodingUrls(html).map((url) => toPath(url)),
    };

    if (pageClass.twin === "required" && !hasTwin) {
      violations.push(
        `${pagePath} [${pageClass.id}] has no markdown twin (expected ${twin})`,
      );
      continue;
    }
    if (pageClass.twin === "forbidden" && hasTwin)
      violations.push(
        `${pagePath} [${pageClass.id}] has a twin the class forbids — ` +
          `reclassify it, do not leave it undeclared`,
      );

    if (hasTwin) {
      checkAnnouncements(page, violations);
      const body = fs.readFileSync(path.join(distDir, twin), "utf8");
      checkTwinBody(
        page,
        { body, twins, sitemapDates: indexes.sitemapDates },
        violations,
      );
    } else checkMissingTwin(page, violations);
    checkIndexes(page, indexes, violations);
  }

  for (const listed of new Set([...indexes.llms, ...indexes.llmsFull]))
    if (listed.endsWith("/index.md") && !twins.has(listed))
      violations.push(
        `an index file lists ${listed}, which the build does not contain`,
      );

  return {
    violations,
    stats: {
      pages: pages.size,
      twins: twins.size,
      classes: PAGE_CLASSES.length,
    },
  };
}

/**
 * CLI entry point: check one build directory and report.
 *
 * @param {string} distArg - Directory to check (default `dist`).
 * @returns {void}
 */
function main(distArg) {
  const distDir = path.resolve(process.cwd(), distArg);
  const { violations, stats } = checkTwins(distDir);
  if (violations.length === 0) {
    console.log(
      `✅ Markdown twin closure holds in ${distArg}: ${stats.pages} pages, ` +
        `${stats.twins} twins, ${stats.classes} declared page classes.`,
    );
    return;
  }
  console.error(
    `❌ Markdown twin / announcement / index drift in ${distArg} — ` +
      `${violations.length} violation(s):\n`,
  );
  for (const violation of violations) console.error(`  ✗ ${violation}`);
  console.error(
    "\n  Every page must match exactly one entry of PAGE_CLASSES in\n" +
      "  scripts/ci/check-markdown-twins.mjs, and honour what that entry\n" +
      "  declares. See GEO audit #6, findings A2 / M5 / M8.\n",
  );
  console.error(REMEDY);
  process.exitCode = 1;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    main(process.argv[2] ?? "dist");
  } catch (error) {
    // Exit 2, never 1: "the guard could not run" must not be reported to the
    // build log as "the site has drifted", or the one message anyone reads is
    // a lie about what happened.
    console.error("❌ check-markdown-twins could not run:", error);
    process.exitCode = 2;
  }
}
