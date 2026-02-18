import { generateRssFeed } from "@utils/rss";

/**
 * Endpoint for generating the site's RSS 2.0 feed (ES).
 *
 * Spanish locale version of the RSS feed. Filters only posts
 * with `lang: "es"` and uses translated strings.
 */
export async function GET(context: { site: URL }) {
  return generateRssFeed(context.site.origin, "es");
}
