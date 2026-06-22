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
import { readFileSync, readdirSync } from "node:fs";
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
  const match = /^---\n([\s\S]*?)\n---/.exec(raw);
  if (!match) return undefined;
  try {
    return parseYaml(match[1]) as PostFrontmatter;
  } catch {
    return undefined;
  }
}

/**
 * Builds a `slug → lastmod ISO string` map from all non-draft posts.
 * Uses `updatedDate` when present, otherwise `publishedDate`.
 */
export function getPostDateMap(): Map<string, string> {
  const map = new Map<string, string>();

  for (const locale of LOCALE_DIRS) {
    const dir = new URL(`${locale}/`, POSTS_DIR);
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
      if (!fm?.slug || fm.draft) continue;

      const date = fm.updatedDate ?? fm.publishedDate;
      if (!date) continue;
      const iso = new Date(date).toISOString();

      // Prefer the most specific/locale-native date; first writer wins per slug
      // unless a later locale has a newer date.
      const existing = map.get(fm.slug);
      if (!existing || iso > existing) {
        map.set(fm.slug, iso);
      }
    }
  }

  return map;
}
