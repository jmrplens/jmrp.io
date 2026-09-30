/**
 * Real byte lengths for the RSS enclosures.
 *
 * RSS 2.0 makes `length` a required attribute of `<enclosure>`: the size of
 * the file in bytes, which a reader can use before it decides to fetch it. The
 * feed endpoint cannot know it. `src/utils/rss.ts` renders while Astro is still
 * generating pages, and the optimized cover it points at (`/_astro/*.jpeg`) is
 * only written after every page is done, so the endpoint emits `length="0"` and
 * this step, which runs once the whole build is on disk, stats each file and
 * writes the real number. Until GEO audit #11 (B7) nothing did, and all 24
 * enclosures declared zero bytes.
 *
 * Must run before `compressAssets`, which snapshots `rss.xml` into `.gz`/`.br`
 * copies that Nginx serves in its place. `optimizeImages`, which runs later,
 * cannot make a length stale: it rewrites PNGs only, and every enclosure is
 * the JPEG that `rss.ts` asks `getImage` for.
 *
 * Imports only Node builtins, `glob` and a logger type, so `node --test` can
 * load it straight from source.
 */
import fs from "node:fs";
import path from "node:path";

import type { AstroIntegrationLogger } from "astro";
import { glob } from "glob";

/** One `<enclosure>` start tag, self-closing or not. */
const ENCLOSURE_TAG = /<enclosure\b[^>]*>/g;

/** The five predefined XML entities, the only ones `escapeXml` produces. */
const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

/**
 * Reads one attribute of a start tag, XML entities decoded.
 *
 * @param tag - The start tag.
 * @param name - The attribute name.
 * @returns The decoded value, or `undefined` when the tag lacks it.
 */
function readAttribute(tag: string, name: string): string | undefined {
  const match = new RegExp(String.raw`\s${name}="([^"]*)"`).exec(tag);
  return match?.[1].replaceAll(
    /&(?:amp|lt|gt|quot|apos);/g,
    (entity) => XML_ENTITIES[entity] ?? entity,
  );
}

/**
 * The built file an enclosure URL points at.
 *
 * Only the path is used: the feed is absolute (`https://jmrp.io/_astro/…`),
 * the file lives at that path under `distDir`. A URL that leaves `distDir` or
 * names nothing there is an error, never a zero.
 *
 * @param url - The enclosure's `url` attribute.
 * @param distDir - The build output directory.
 * @returns Absolute path of the file.
 * @throws If the URL is not absolute or does not resolve to a built file.
 */
function resolveEnclosureFile(url: string, distDir: string): string {
  const parsed = URL.parse(url);
  if (!parsed) throw new Error(`enclosure URL is not absolute: ${url}`);
  const file = path.join(distDir, decodeURIComponent(parsed.pathname));
  const rel = path.relative(distDir, file);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`enclosure URL points outside the build: ${url}`);
  }
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`enclosure file is missing from the build: ${url}`);
  }
  return file;
}

/**
 * Sets every enclosure's `length` to the size of the file it names.
 *
 * Every enclosure is recomputed, whatever it declared, so a value can never
 * survive from the render step or from an earlier run.
 *
 * @param xml - The feed.
 * @param distDir - The build output directory.
 * @returns The patched feed and how many enclosures it carries.
 * @throws If an enclosure has no `url`, or its file is not in the build.
 */
export function fillEnclosureLengths(
  xml: string,
  distDir: string,
): { xml: string; count: number } {
  let count = 0;
  const patched = xml.replaceAll(ENCLOSURE_TAG, (tag) => {
    const url = readAttribute(tag, "url");
    if (!url) throw new Error(`enclosure without a url: ${tag}`);
    const { size } = fs.statSync(resolveEnclosureFile(url, distDir));
    count++;
    if (/\slength="[^"]*"/.test(tag)) {
      return tag.replace(
        /(\slength=")[^"]*"/,
        (_, prefix: string) => `${prefix}${size}"`,
      );
    }
    return tag.replace(
      /\s*(\/?)>$/,
      (_, slash: string) => ` length="${size}"${slash ? " />" : ">"}`,
    );
  });
  return { xml: patched, count };
}

/**
 * Patches the enclosure lengths of every feed in the build.
 *
 * @param distDir - The build output directory.
 * @param logger - The Astro logger instance.
 * @throws If any enclosure cannot be matched to a built file, naming the feed.
 */
export async function patchRssEnclosureLengths(
  distDir: string,
  logger: AstroIntegrationLogger,
): Promise<void> {
  const feeds = await glob("**/rss.xml", { cwd: distDir, absolute: true });
  for (const feed of feeds.toSorted((a, b) => a.localeCompare(b))) {
    const label = path.relative(distDir, feed);
    const original = await fs.promises.readFile(feed, "utf8");
    let result: { xml: string; count: number };
    try {
      result = fillEnclosureLengths(original, distDir);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${label}: ${message}`, { cause: error });
    }
    if (result.xml !== original) {
      await fs.promises.writeFile(feed, result.xml, "utf8");
    }
    logger.info(
      `  ✓ ${label}: ${result.count} enclosure lengths from the built files`,
    );
  }
}
