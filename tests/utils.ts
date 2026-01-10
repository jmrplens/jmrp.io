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
export async function getSitemapUrls(): Promise<string[]> {
  let sitemapContent = "";
  let isIndex = false;

  if (fs.existsSync(SITEMAP_INDEX_PATH)) {
    sitemapContent = fs.readFileSync(SITEMAP_INDEX_PATH, "utf-8");
    isIndex = true;
  } else if (fs.existsSync(SITEMAP_0_PATH)) {
    sitemapContent = fs.readFileSync(SITEMAP_0_PATH, "utf-8");
  } else if (fs.existsSync(SITEMAP_PATH)) {
    sitemapContent = fs.readFileSync(SITEMAP_PATH, "utf-8");
  } else {
    console.warn("No sitemap found in dist/. Defaulting to core pages.");
    return ["/", "/blog/", "/cv/", "/publications/", "/services/"];
  }

  const parsed = (await parseStringPromise(sitemapContent)) as
    | SitemapResult
    | SitemapIndexResult;
  const urls: string[] = [];

  if (isIndex && "sitemapindex" in parsed) {
    // It's an index, fetch/read child sitemaps
    for (const sm of parsed.sitemapindex.sitemap) {
      const loc = sm.loc[0];
      if (!loc) continue;
      const filename = path.basename(new URL(loc).pathname);
      const childPath = path.resolve("dist", filename);

      if (fs.existsSync(childPath)) {
        const childContent = fs.readFileSync(childPath, "utf-8");
        const childParsed = (await parseStringPromise(
          childContent,
        )) as SitemapResult;
        if (childParsed.urlset?.url) {
          urls.push(
            ...childParsed.urlset.url.map((u) => {
              const urlLoc = u.loc[0];
              return urlLoc ? new URL(urlLoc).pathname : "";
            }),
          );
        }
      }
    }
  } else if ("urlset" in parsed && parsed.urlset?.url) {
    urls.push(
      ...parsed.urlset.url.map((u) => {
        const loc = u.loc[0];
        return loc ? new URL(loc).pathname : "";
      }),
    );
  }

  return urls.filter((u) => u !== "");
}
