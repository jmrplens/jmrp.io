import fs from "node:fs";
import path from "node:path";

import type { AstroIntegrationLogger } from "astro";

import { assertNginxSafe, writeNginxSnippet } from "./utils.js";

/**
 * Generates `nginx/tag_redirects.conf`: an Nginx `map` that turns the URL of a
 * retired blog tag into the tag that absorbed it, or into the blog index when
 * no current tag covers it.
 *
 * Why this is generated rather than hand-written: the vhost used to carry 56
 * `location =` blocks for 14 tags — four per tag (EN/ES, with and without the
 * trailing slash). That was 56 of the file's 807 lines for one concern, and it
 * had two defects a map does not have:
 *
 *   1. `location =` is CASE-SENSITIVE, so `/blog/tags/mTLS/` 404ed while
 *      `/blog/tags/mtls/` redirected. Nginx compares `map` keys
 *      case-insensitively, which fixes 156 requests measured over the log
 *      history without a single extra entry.
 *   2. Adding a tag meant remembering all four forms. Here it is one line in
 *      `src/data/tag-redirects.json`.
 *
 * Written to the repo, not to dist/: dist is the public blue/green symlink, and
 * a build from a revision predating this step would leave the vhost include
 * dangling. Same reasoning as blog-redirects.ts and docs-redirects.ts.
 */
const MAP_VARIABLE = "$blog_tag_redirect";

/** One group of the data file: tag slug → destination, plus a `$comment`. */
type TagGroup = Record<string, string>;

/** Shape of `src/data/tag-redirects.json`. */
interface TagRedirectData {
  consolidated?: TagGroup;
  retired?: TagGroup;
  hallucinated?: TagGroup;
  /** Standalone legacy paths (not tags): key is the path, value the target. */
  paths?: TagGroup;
}

/**
 * Resolves a data-file value to the path Nginx should redirect to.
 *
 * @param value - Either `tag:<slug>` or `blog`.
 * @param locale - Locale prefix, `""` for English or `/es` for Spanish.
 * @returns The absolute destination path.
 */
function destination(value: string, locale: string): string {
  return value.startsWith("tag:")
    ? `${locale}/blog/tags/${value.slice("tag:".length)}/`
    : `${locale}/blog/`;
}

/**
 * Writes the retired-tag redirect map.
 *
 * @param logger - Astro integration logger.
 * @returns Resolves once the snippet has been written.
 */
export async function generateTagRedirects(
  logger: AstroIntegrationLogger,
): Promise<void> {
  const dataPath = path.join(process.cwd(), "src/data/tag-redirects.json");
  const data = JSON.parse(
    fs.readFileSync(dataPath, "utf8"),
  ) as TagRedirectData & { $comment?: unknown };

  // `$comment` keys document the file for humans; they are not tags.
  const tags = [data.consolidated, data.retired, data.hallucinated]
    .filter((group): group is TagGroup => Boolean(group))
    .flatMap((group) =>
      Object.entries(group).filter(([slug]) => !slug.startsWith("$")),
    );

  const legacy = Object.entries(data.paths ?? {}).filter(
    ([p]) => !p.startsWith("$"),
  );

  const pairs = tags.flatMap(([slug, value]) =>
    ["", "/es"].flatMap((locale) => {
      const from = `${locale}/blog/tags/${slug}`;
      const to = destination(value, locale);
      return [
        [from, to],
        [`${from}/`, to],
      ] as const;
    }),
  );

  // Standalone legacy paths get the same EN/ES + trailing-slash treatment.
  const legacyPairs = legacy.flatMap(([from, to]) =>
    ["", "/es"].flatMap((locale) => {
      const source = `${locale}${from}`;
      const target = to === "/" ? `${locale}/` : `${locale}${to}`;
      return [
        [source, target],
        [`${source}/`, target],
      ] as const;
    }),
  );
  pairs.push(...legacyPairs);

  // A retired tag's CARD IMAGE, too. The tag page itself has redirected for a
  // while, but a social crawler holding an old copy fetches the `og:image` URL
  // straight from its cache — `/og/blog/tags/honeypot.png` was answering 404
  // (measured in the access log, referred by /blog/tags/honeypot/), so the
  // preview lost its image even though the page behind it resolved fine.
  // No trailing-slash variants: these are files, not directories.
  const ogPairs = tags.flatMap(([slug, value]) =>
    ["", "/es"].map((locale) => {
      const target = value.startsWith("tag:")
        ? `/og${locale}/blog/tags/${value.slice("tag:".length)}.png`
        : `/og${locale}/blog.png`;
      return [`/og${locale}/blog/tags/${slug}.png`, target] as const;
    }),
  );
  pairs.push(...ogPairs);

  // Interpolated into quoted map entries below, and this file never passes
  // through the Zod content schema — see assertNginxSafe.
  assertNginxSafe(
    pairs.flatMap(([from, to]) => [from, to]),
    "tag-redirects.json (slug / destination)",
  );

  const entries = pairs
    .map(([from, to]) => `    "${from}"  "${to}";`)
    .join("\n");

  const content = `# GENERATED FILE — DO NOT EDIT.
# Written by src/integrations/post-build/tag-redirects.ts on every build,
# derived from src/data/tag-redirects.json.
#
# Retired blog tags keep answering 301 instead of 404: their URLs were in the
# sitemap, are indexed, and still get real traffic. Edit the JSON to add one —
# the EN/ES and trailing-slash forms are emitted from a single entry.
#
# Nginx compares map keys case-insensitively, so /blog/tags/mTLS/ lands here
# too. The 56 hand-written \`location =\` blocks this replaces did not.
#
# Included at http level; consumed by the server block as:
#     if (${MAP_VARIABLE}) { return 301 ${MAP_VARIABLE}; }
#
# Tags: ${tags.length} + ${legacy.length} legacy path(s) (x4: EN/ES, with and
# without slash), plus ${ogPairs.length} og:image keys (x2: EN/ES, no slash form)

map $uri ${MAP_VARIABLE} {
    default "";

${entries}
}
`;

  const outPath = path.join(process.cwd(), "nginx", "tag_redirects.conf");
  await writeNginxSnippet(outPath, content);
  logger.info(
    `  ✓ Generated nginx/tag_redirects.conf (${tags.length} tags + ${legacy.length} legacy paths)`,
  );
}
