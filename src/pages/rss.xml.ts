import { defaultLocale } from "@i18n/config";
import { generateRssFeed } from "@utils/rss";

/**
 * Endpoint for generating the site's RSS 2.0 feed (EN).
 *
 * Includes full support for:
 * - Content collections (blog posts).
 * - Enclosures and Media RSS (thumbnails/hero images).
 * - Proper escaping and "Continue Reading" links for better reader compatibility.
 * - Automatic filtering of draft posts in production.
 */
export async function GET(context: { site: URL }) {
  return generateRssFeed(context.site.origin, defaultLocale);
}
