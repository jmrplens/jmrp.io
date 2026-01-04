import fs from "node:fs";
import path from "node:path";
import { parseStringPromise } from "xml2js";

const SITEMAP_PATH = path.resolve("dist/sitemap-0.xml");

interface SitemapUrl {
  loc: string[];
}

interface SitemapUrlSet {
  url: SitemapUrl[];
}

interface SitemapResult {
  urlset: SitemapUrlSet;
}

export async function getSitemapUrls(): Promise<string[]> {
  if (!fs.existsSync(SITEMAP_PATH)) {
    console.warn(
      `Sitemap not found at ${SITEMAP_PATH}. Defaulting to core pages.`,
    );
    return ["/", "/blog/", "/cv/", "/publications/", "/services/"];
  }

  const sitemapContent = fs.readFileSync(SITEMAP_PATH, "utf-8");

  const parsed = (await parseStringPromise(sitemapContent)) as SitemapResult;
  const urls: string[] = parsed.urlset.url.map((u) => {
    const loc = u.loc[0];
    return new URL(loc).pathname;
  });
  return urls;
}
