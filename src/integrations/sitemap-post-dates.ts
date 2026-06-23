/**
 * Sitemap per-post lastmod dates.
 *
 * The `@astrojs/sitemap` `serialize` callback only receives the page URL, with
 * no access to content-collection data. To emit a real `<lastmod>` per blog
 * post (instead of a single uniform build timestamp), we parse each post's
 * frontmatter from disk once and expose a `slug → ISO date` map.
 *
 * Non-post pages keep the build timestamp, which is appropriate since they are
 * regenerated on every build.
 */
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
