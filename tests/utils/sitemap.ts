/**
 * Sitemap Utilities for Playwright Tests
 *
 * Functions to parse sitemaps and discover pages for testing.
 */

import fs from "node:fs";
import path from "node:path";

import { parseStringPromise } from "xml2js";

import type {
  PageInfo,
  SitemapIndexResult,
  SitemapResult,
  SitemapUrlSet,
} from "./types";

const SITEMAP_INDEX_PATH = path.resolve("dist/sitemap-index.xml");
const SITEMAP_0_PATH = path.resolve("dist/sitemap-0.xml");
const SITEMAP_PATH = path.resolve("dist/sitemap.xml");

/**
 * Finds the most relevant sitemap file in the dist directory.
 * @returns The content and whether it's an index, or null if not found.
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
 * Parses all sitemaps to retrieve a list of all site URLs as pathnames.
 * Handles sitemap indexes and individual sitemap files.
 *
 * @returns A list of relative pathnames found in the sitemap.
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

/** Default fallback pages when sitemap is unavailable. */
const FALLBACK_PAGES: PageInfo[] = [
  { name: "Home", url: "/" },
  { name: "Publications", url: "/publications" },
  { name: "CV", url: "/cv" },
  { name: "GitHub", url: "/github" },
  { name: "Services", url: "/services" },
  { name: "Blog Index", url: "/blog" },
];

/**
 * Parses sitemap to retrieve pages with friendly names for test descriptions.
 * Optimizes by only including the first tag page encountered.
 *
 * @returns Array of page objects with name and URL.
 */
export async function getPagesFromSitemap(): Promise<PageInfo[]> {
  console.log(`📂 Current directory: ${process.cwd()}`);
  const sitemapFiles = ["sitemap-0.xml", "sitemap.xml", "sitemap-index.xml"];
  let sitemapPath = "";

  for (const file of sitemapFiles) {
    const testPath = path.join(process.cwd(), "dist", file);
    if (fs.existsSync(testPath)) {
      sitemapPath = testPath;
      break;
    }
  }

  if (!sitemapPath) {
    console.warn("⚠️  Sitemap not found in dist/, using manual page list");
    return FALLBACK_PAGES;
  }

  console.log(`🔍 Using sitemap at: ${sitemapPath}`);

  try {
    const sitemapContent = fs.readFileSync(sitemapPath, "utf-8");
    const sitemap = (await parseStringPromise(sitemapContent)) as SitemapResult;

    let urls = sitemap.urlset.url.map((entry) => {
      const fullUrl = entry.loc[0];
      const urlPath = fullUrl.replace("https://jmrp.io", "");

      // Generate friendly name from path
      const name =
        urlPath === "/"
          ? "Home"
          : urlPath
              .split("/")
              .filter(Boolean)
              .map((s: string) =>
                s
                  .split("-")
                  .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(" "),
              )
              .join(" - ");

      return { name, url: urlPath };
    });

    // Optimization: Only include the first tag page encountered
    let tagFound = false;
    urls = urls.filter((page) => {
      if (page.url.includes("/blog/tags/")) {
        if (tagFound) return false;
        tagFound = true;
      }
      return true;
    });

    console.log(`📄 Found ${urls.length} optimized pages in sitemap`);
    return urls;
  } catch (error) {
    console.error("❌ Error parsing sitemap:", error);
    return FALLBACK_PAGES;
  }
}
