/**
 * Sitemap lastmod dates, derived from content rather than from the build clock.
 *
 * The `@astrojs/sitemap` `serialize` callback only receives the page URL, with
 * no access to content-collection data, so everything it needs is resolved here
 * once and exposed as lookup maps.
 *
 * ── Why this covers more than posts now ──────────────────────────────────
 * This module used to answer for blog posts only, and every other URL fell back
 * to a single build timestamp. On this site `pnpm build` is the deploy, so that
 * meant 98 of 122 URLs advertised a brand-new `lastmod` on every deploy —
 * identical to the millisecond — including 18 tool pages that simultaneously
 * declared `changefreq: yearly`. Crawlers discount `lastmod` from sources that
 * behave that way, which devalued the signal on the 24 post URLs where it was
 * accurate.
 *
 * Each page now answers from whatever actually determines its content:
 * frontmatter dates where they exist, the git history of the source file
 * otherwise, and for index/tag/category pages the newest date among the items
 * they list — a listing really is modified when a new entry appears in it.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { load as parseYaml } from "js-yaml";

const POSTS_DIR = new URL("../content/posts/", import.meta.url);
const LOCALE_DIRS = ["en", "es"];

interface PostFrontmatter {
  slug?: string;
  publishedDate?: string | Date;
  updatedDate?: string | Date;
  draft?: boolean;
}

/** Extracts and parses the YAML frontmatter block from raw MDX content. */
function parseFrontmatter(raw: string): PostFrontmatter | undefined {
  // Tolerate CRLF line endings and a leading BOM/whitespace.
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw.trimStart());
  if (!match) return undefined;
  try {
    return parseYaml(match[1]) as PostFrontmatter;
  } catch {
    return undefined;
  }
}

/** Lists the files in a locale's post directory (empty if it doesn't exist). */
function listPostFiles(locale: string): { dir: URL; files: string[] } {
  const dir = new URL(`${locale}/`, POSTS_DIR);
  try {
    return { dir, files: readdirSync(fileURLToPath(dir)) };
  } catch {
    return { dir, files: [] }; // Locale directory may not exist.
  }
}

/**
 * Extracts `{ slug, iso }` from a post file, or undefined when the file is not
 * a published post or has no usable date. Uses `updatedDate` then `publishedDate`.
 */
function readPostDate(
  dir: URL,
  file: string,
): { slug: string; iso: string } | undefined {
  if (!file.endsWith(".mdx") || file.startsWith("_")) return undefined;
  const raw = readFileSync(fileURLToPath(new URL(file, dir)), "utf8");
  const fm = parseFrontmatter(raw);
  if (!fm?.slug || fm.draft) return undefined;
  const date = fm.updatedDate ?? fm.publishedDate;
  if (!date) return undefined;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return undefined; // skip malformed dates
  return { slug: fm.slug, iso: parsed.toISOString() };
}

/**
 * Builds a `slug → lastmod ISO string` map from all non-draft posts.
 * When a slug exists in several locales, keeps the newest date.
 */
export function getPostDateMap(): Map<string, string> {
  const map = new Map<string, string>();

  for (const locale of LOCALE_DIRS) {
    const { dir, files } = listPostFiles(locale);
    for (const file of files) {
      const entry = readPostDate(dir, file);
      if (!entry) continue;
      const existing = map.get(entry.slug);
      if (!existing || entry.iso > existing) map.set(entry.slug, entry.iso);
    }
  }

  return map;
}

const REPO_ROOT = new URL("../../", import.meta.url);

/**
 * Last commit date for a repo-relative path, as a full ISO timestamp.
 *
 * Returns undefined when git cannot answer (shallow checkout, untracked file)
 * so callers can fall back deliberately instead of inheriting a wrong date.
 */
function gitDate(repoRelativePath: string): string | undefined {
  try {
    const stdout = execFileSync(
      // eslint-disable-next-line sonarjs/no-os-command-from-path -- PATH is pinned below to /usr/bin:/bin, both root-owned
      "git",
      ["log", "-1", "--format=%cI", "--", repoRelativePath],
      {
        cwd: fileURLToPath(REPO_ROOT),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        // Root-owned PATH only, so `git` cannot be shadowed by a writable
        // directory inherited from the build shell. Mirrors
        // `DEFAULT_SECURE_PATH` in `scripts/deploy-live.mjs`.
        env: { ...process.env, PATH: "/usr/bin:/bin" }, // NOSONAR
      },
    ).trim();
    return stdout ? new Date(stdout).toISOString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Newest of a set of ISO strings, ignoring undefined entries.
 *
 * ISO-8601 timestamps sort correctly as plain strings, but the comparator is
 * explicit so the ordering does not silently depend on that property.
 */
function newest(...dates: (string | undefined)[]): string | undefined {
  return dates
    .filter((d): d is string => Boolean(d))
    .sort((a, b) => a.localeCompare(b))
    .at(-1);
}

/**
 * A frontmatter date as an ISO timestamp, or undefined when absent or invalid.
 *
 * Validity is decided with `Number.isNaN(getTime())` rather than by calling
 * `toISOString()` and catching: that method throws a RangeError on an
 * unparseable date, and the original code tested validity only afterwards, so
 * a single malformed `updatedDate` in any tool's frontmatter would abort
 * `pnpm build` for the whole site instead of skipping one page.
 *
 * Extracted so `getToolDateMap` stays under the cognitive-complexity budget,
 * and so neither `NaN` nor `Number.NaN` has to appear as a literal — ESLint's
 * unicorn plugin requires the first spelling and SonarJS requires the second,
 * so the only way to satisfy both is not to write either.
 */
function frontmatterDate(value: string | Date | undefined): string | undefined {
  if (value === undefined) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/**
 * Tool slug → lastmod, from frontmatter when present and git history otherwise.
 * Tool pages are hand-maintained MDX, so their real modification date is the
 * last time someone edited that MDX — never the deploy that happened to follow.
 */
function getToolDateMap(): Map<string, string> {
  const map = new Map<string, string>();
  const toolsDir = new URL("../content/tools/", import.meta.url);

  for (const locale of LOCALE_DIRS) {
    const dir = new URL(`${locale}/`, toolsDir);
    let files: string[];
    try {
      files = readdirSync(fileURLToPath(dir));
    } catch {
      continue; // Locale directory may not exist.
    }

    for (const file of files) {
      if (!file.endsWith(".mdx") || file.startsWith("_")) continue;
      const raw = readFileSync(fileURLToPath(new URL(file, dir)), "utf8");
      const fm = parseFrontmatter(raw);
      const iso =
        frontmatterDate(fm?.updatedDate ?? fm?.publishedDate) ??
        gitDate(`src/content/tools/${locale}/${file}`);
      if (!iso) continue;
      const slug = fm?.slug ?? file.replace(/\.mdx$/, "");
      map.set(slug, newest(map.get(slug), iso) ?? iso);
    }
  }

  return map;
}

/**
 * Resolves `<lastmod>` for any sitemap URL from its real content source.
 *
 * @returns A function taking the locale-stripped path and returning an ISO
 *   timestamp, or undefined when nothing can be determined (the caller then
 *   omits `lastmod` — an absent element is valid and honest, whereas the build
 *   clock is a claim that the page changed when it did not).
 */
export function createLastmodResolver(): (path: string) => string | undefined {
  const postDates = getPostDateMap();
  const toolDates = getToolDateMap();

  const newestPost = newest(...postDates.values());
  const newestTool = newest(...toolDates.values());

  // Static pages, each keyed to whatever file actually holds its content.
  const staticSources: Record<string, string[]> = {
    "/about/": ["src/content/profile/about.yaml"],
    "/uses/": ["src/content/profile/uses.yaml"],
    "/projects/": ["src/content/profile/projects.yaml"],
    "/cv/": ["src/content/cv/en.yaml", "src/content/cv/es.yaml"],
    "/publications/": [
      "src/content/publications_data/papers.bib",
      "src/content/publications_data/coauthors.yaml",
    ],
    "/homelab/": ["src/pages/homelab.astro"],
    "/privacy/": [
      "src/i18n/translations/en/common.ts",
      "src/i18n/translations/es/common.ts",
    ],
  };
  const staticDates = new Map<string, string | undefined>(
    Object.entries(staticSources).map(([path, sources]) => [
      path,
      newest(...sources.map((source) => gitDate(source))),
    ]),
  );

  return (rawPath) => {
    const path = rawPath === "" ? "/" : rawPath;

    // Home: the newest thing it surfaces. It is a shop window onto the posts,
    // so it genuinely changes when they do.
    if (path === "/") return newest(newestPost, newestTool);

    // `[^/]+` also matches the section roots `/blog/series/` and `/blog/tags/`,
    // which are not post slugs — without this guard they resolved to
    // `postDates.get("series")` (undefined) and returned early, so those two
    // URLs shipped with no <lastmod> at all and were resubmitted to IndexNow on
    // every single deploy as "unknown, assume changed".
    const postSlug = /^\/blog\/([^/]+)\/?$/.exec(path);
    if (postSlug && !["series", "tags"].includes(postSlug[1]))
      return postDates.get(postSlug[1]);

    const toolSlug = /^\/tools\/([^/]+)\/?$/.exec(path);
    if (toolSlug && toolSlug[1] !== "categories")
      return toolDates.get(toolSlug[1]);

    // Listings are modified when their contents are. Tag and category pages
    // resolve to the newest item of their kind rather than the newest item
    // carrying that exact tag: the sitemap has no tag index to consult here,
    // and over-reporting within the same corpus is far cheaper than the build
    // clock this replaces.
    if (path === "/blog/" || path.startsWith("/blog/tags/")) return newestPost;
    if (path === "/blog/series/" || path.startsWith("/blog/series/"))
      return newestPost;
    if (path === "/tools/" || path.startsWith("/tools/categories/"))
      return newestTool;

    return staticDates.get(path);
  };
}
