import fs from "node:fs";
import path from "node:path";

import type { AstroIntegrationLogger } from "astro";

import { assertNginxSafe, writeNginxSnippet } from "./utils.js";

/**
 * Blog post directories are named with a numeric ordering prefix
 * (`001-secure-nginx-client-certificates`) and that prefix leaks into the
 * public URL. External systems — AI engines especially — cite the *natural*
 * slug without it, so `/blog/secure-nginx-client-certificates/` is requested
 * regularly and 404s. See the GEO audit (2026-08-22) for the measured traffic.
 *
 * Rather than hand-maintaining a redirect list that silently rots every time a
 * post is added, this step derives it from the build output on every run.
 */
const SLUG_PREFIX = /^(\d{3})-(.+)$/;

/** Matches the generated snippet's `map` variable used by the vhost. */
const MAP_VARIABLE = "$blog_prefixless_redirect";

/**
 * Collects every built blog post directory for one locale.
 *
 * @param distDir - Build output directory.
 * @param localePrefix - URL prefix for the locale (`""` for EN, `"/es"` for ES).
 * @returns Directory names of the locale's blog posts, or `[]` when absent.
 */
function readBlogDirs(distDir: string, localePrefix: string): string[] {
  const blogDir = path.join(distDir, localePrefix, "blog");
  if (!fs.existsSync(blogDir)) {
    return [];
  }
  return fs
    .readdirSync(blogDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/**
 * Builds the prefix-less → canonical URL pairs for one locale.
 *
 * Skips any post whose prefix-less slug would collide with another post or
 * with an existing route in the same locale: emitting a redirect there could
 * shadow a real page, which is strictly worse than the 404 it replaces.
 *
 * @param distDir - Build output directory.
 * @param localePrefix - URL prefix for the locale (`""` for EN, `"/es"` for ES).
 * @param logger - Astro logger, used to report skipped collisions.
 * @returns Ordered `[from, to]` URL pairs, both with a trailing slash.
 */
function collectLocaleRedirects(
  distDir: string,
  localePrefix: string,
  logger: AstroIntegrationLogger,
): [string, string][] {
  const dirs = readBlogDirs(distDir, localePrefix);
  const taken = new Set(dirs);

  const bareCounts = new Map<string, number>();
  for (const dir of dirs) {
    const match = SLUG_PREFIX.exec(dir);
    if (match) {
      bareCounts.set(match[2], (bareCounts.get(match[2]) ?? 0) + 1);
    }
  }

  const pairs: [string, string][] = [];
  for (const dir of dirs.toSorted((a, b) => a.localeCompare(b))) {
    const match = SLUG_PREFIX.exec(dir);
    if (!match) {
      continue;
    }
    const bare = match[2];

    if (taken.has(bare)) {
      logger.warn(
        `  ⚠ blog redirect skipped: ${localePrefix}/blog/${bare}/ is already a real route`,
      );
      continue;
    }
    if ((bareCounts.get(bare) ?? 0) > 1) {
      logger.warn(
        `  ⚠ blog redirect skipped: ${localePrefix}/blog/${bare}/ is ambiguous (${bareCounts.get(bare)} posts share it)`,
      );
      continue;
    }

    pairs.push([
      `${localePrefix}/blog/${bare}/`,
      `${localePrefix}/blog/${dir}/`,
    ]);
  }
  return pairs;
}

/**
 * Generates `blog_redirects.conf`: an Nginx `map` that turns a prefix-less blog
 * URL into its canonical `NNN-` counterpart, so the vhost can answer with a
 * real 301 instead of a 404.
 *
 * The snippet is regenerated from the build output on every run, so posts added
 * later are covered with no manual step. It is included from the vhost at
 * `http` level; the server block issues the redirect when the map is non-empty.
 *
 * Both the slash and no-slash forms are emitted because external citations use
 * either, and `$uri` is matched verbatim.
 *
 * @param distDir - Build output directory.
 * @param logger - Astro integration logger.
 * @returns Resolves once the snippet has been written.
 */
export async function generateBlogRedirects(
  distDir: string,
  logger: AstroIntegrationLogger,
): Promise<void> {
  const pairs = [
    ...collectLocaleRedirects(distDir, "", logger),
    ...collectLocaleRedirects(distDir, "/es", logger),
  ];

  // Slugs come from directory names on disk, so they are already constrained —
  // but they are interpolated into quoted Nginx map entries all the same, and
  // this file is `include`d by the live vhost. Same guard as docs-redirects.
  assertNginxSafe(
    pairs.flatMap(([from, to]) => [from, to]),
    "blog post slugs",
  );

  const entries = pairs
    .flatMap(([from, to]) => [
      // The no-slash form first: Nginx would otherwise 301 it to the slash form
      // via try_files, costing citations an extra hop.
      `    "${from.replace(/\/$/, "")}"  "${to}";`,
      `    "${from}"  "${to}";`,
    ])
    .join("\n");

  const content = `# GENERATED FILE — DO NOT EDIT.
# Written by src/integrations/post-build/blog-redirects.ts on every build.
#
# Blog posts are published under a numeric ordering prefix
# (/blog/001-secure-nginx-client-certificates/), but external systems — AI
# engines in particular — cite the natural slug without it. This map turns the
# prefix-less form into the canonical one so the vhost can answer 301 instead
# of 404. Regenerated from the build output, so new posts are covered
# automatically.
#
# Included at http level; consumed by the server block as:
#     if (${MAP_VARIABLE}) { return 301 ${MAP_VARIABLE}; }
#
# Pairs: ${pairs.length} (x2 for the no-slash form)

map $uri ${MAP_VARIABLE} {
    default "";

${entries}
}
`;

  // Deliberately NOT written into dist/: that directory is public (verified —
  // /security_headers_assets.conf is reachable over HTTP) and, more importantly,
  // dist is the blue/green symlink. Nginx includes this file by absolute path,
  // so a build from a revision that predates this step would leave the include
  // dangling and fail `nginx -t`. Keeping it in the repo means the path always
  // resolves; the content only changes when posts are added or renamed.
  const outPath = path.join(process.cwd(), "nginx", "blog_redirects.conf");
  await writeNginxSnippet(outPath, content);
  logger.info(
    `  ✓ Generated nginx/blog_redirects.conf (${pairs.length} prefix-less redirects)`,
  );
}
