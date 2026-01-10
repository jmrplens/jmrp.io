/**
 * Test Utilities
 *
 * Helper functions for Playwright end-to-end tests.
 */

import fs from "node:fs";
import path from "node:path";

import { parseStringPromise } from "xml2js";

const SITEMAP_INDEX_PATH = path.resolve("dist/sitemap-index.xml");
const SITEMAP_0_PATH = path.resolve("dist/sitemap-0.xml");
const SITEMAP_PATH = path.resolve("dist/sitemap.xml");

interface SitemapUrl {
  loc: string[];
}

interface SitemapUrlSet {
  url: SitemapUrl[];
}

interface SitemapResult {
  urlset: SitemapUrlSet;
}

interface SitemapIndex {
  sitemap: { loc: string[] }[];
}

interface SitemapIndexResult {
  sitemapindex: SitemapIndex;
}

/**
 * Parses all sitemaps to retrieve a list of all site URLs.
 * Handles sitemap indexes and individual sitemap files.
 *
 * @returns {Promise<string[]>} A list of relative pathnames found in the sitemap.
 */
/**
 * Finds the most relevant sitemap file in the dist directory.
 * Returns the content and whether it's an index.
 */
function findSitemap(): { content: string; isIndex: boolean } | null {
  if (fs.existsSync(SITEMAP_INDEX_PATH)) {
    return {
      content: fs.readFileSync(SITEMAP_INDEX_PATH, "utf-8"),
      isIndex: true,
    };
  }
  if (fs.existsSync(SITEMAP_0_PATH)) {
    return {
      content: fs.readFileSync(SITEMAP_0_PATH, "utf-8"),
      isIndex: false,
    };
  }
  if (fs.existsSync(SITEMAP_PATH)) {
    return { content: fs.readFileSync(SITEMAP_PATH, "utf-8"), isIndex: false };
  }
  return null;
}

/**
 * Extracts pathnames from a sitemap urlset.
 */
function extractPathnames(urlset: SitemapUrlSet): string[] {
  if (!urlset?.url) return [];
  return urlset.url
    .map((u) => {
      const loc = u.loc[0];
      try {
        return loc ? new URL(loc).pathname : "";
      } catch {
        return "";
      }
    })
    .filter((u) => u !== "");
}

/**
 * Parses all sitemaps to retrieve a list of all site URLs.
 * Handles sitemap indexes and individual sitemap files.
 *
 * @returns {Promise<string[]>} A list of relative pathnames found in the sitemap.
 */
export async function getSitemapUrls(): Promise<string[]> {
  const sitemap = findSitemap();

  if (!sitemap) {
    console.warn("No sitemap found in dist/. Defaulting to core pages.");
    return ["/", "/blog/", "/cv/", "/publications/", "/services/"];
  }

  const parsed = (await parseStringPromise(sitemap.content)) as
    | SitemapResult
    | SitemapIndexResult;
  const urls: string[] = [];

  if (sitemap.isIndex && "sitemapindex" in parsed) {
    for (const sm of parsed.sitemapindex.sitemap) {
      const loc = sm.loc[0];
      if (!loc) continue;

      try {
        const filename = path.basename(new URL(loc).pathname);
        const childPath = path.resolve("dist", filename);

        if (fs.existsSync(childPath)) {
          const childContent = fs.readFileSync(childPath, "utf-8");
          const childParsed = (await parseStringPromise(
            childContent,
          )) as SitemapResult;
          urls.push(...extractPathnames(childParsed.urlset));
        }
      } catch {
        console.warn(`Skipping invalid or missing sitemap in index: ${loc}`);
      }
    }
  } else if ("urlset" in parsed) {
    urls.push(...extractPathnames(parsed.urlset));
  }

  return [...new Set(urls)];
}
