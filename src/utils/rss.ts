/**
 * Shared RSS feed generation utilities.
 *
 * Used by both `/rss.xml` (EN) and `/es/rss.xml` (ES) endpoints
 * to generate locale-specific RSS 2.0 feeds.
 */
import type { Locale } from "@i18n/config";
import { localeConfig } from "@i18n/config";
import { useTranslations } from "@i18n/utils";
import { getImage } from "astro:assets";
import { type CollectionEntry, getCollection } from "astro:content";

/** Escape XML special characters for safe embedding. */
export const escapeXml = (unsafe: string): string => {
  return unsafe.replaceAll(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": {
        return "&lt;";
      }
      case ">": {
        return "&gt;";
      }
      case "&": {
        return "&amp;";
      }
      case "'": {
        return "&apos;";
      }
      case '"': {
        return "&quot;";
      }
    }
    return c;
  });
};

/**
 * Generate a single RSS `<item>` element for a blog post.
 *
 * @param post - The blog post content collection entry.
 * @param site - The absolute site origin URL.
 * @param locale - The target locale.
 * @param pathPrefix - URL path prefix for the locale (e.g. "" for EN, "/es" for ES).
 * @returns XML string for the RSS item.
 */
export async function generateRssItem(
  post: CollectionEntry<"posts">,
  site: string,
  locale: Locale,
  pathPrefix: string,
): Promise<string> {
  const link = `${pathPrefix}/blog/${post.data.slug}/`;
  const fullLink = new URL(link, site).toString();
  const t = useTranslations(locale);
  const description = post.data.description || t("seo.siteDescription");

  let customData = "";
  // Add correct cover image enclosure (compliant with RSS readers)
  if (post.data.coverImage) {
    try {
      const opt = await getImage({
        src: post.data.coverImage,
        format: "jpeg",
        width: 1200,
      });
      const thumb = await getImage({
        src: post.data.coverImage,
        format: "jpeg",
        width: 400,
      });
      // JPEG chosen over WebP for maximum compatibility with RSS readers
      const imgUrl = new URL(opt.src, site).toString();
      const thumbUrl = new URL(thumb.src, site).toString();

      // RSS 2.0 Enclosure (Used by most modern readers for the main image)
      customData += `<enclosure url="${escapeXml(imgUrl)}" length="0" type="image/jpeg" />\n`;

      // Media RSS extensions (Common in Feedly, etc)
      if (
        typeof opt.attributes?.width === "number" &&
        typeof opt.attributes?.height === "number"
      ) {
        customData += `<media:content url="${escapeXml(imgUrl)}" medium="image" type="image/jpeg" width="${opt.attributes.width}" height="${opt.attributes.height}" />\n`;
      }

      if (
        typeof thumb.attributes?.width === "number" &&
        typeof thumb.attributes?.height === "number"
      ) {
        customData += `<media:thumbnail url="${escapeXml(thumbUrl)}" width="${thumb.attributes.width}" height="${thumb.attributes.height}" />\n`;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[RSS] Cover image process failed for ${post.id}: ${message}`,
      );
    }
  }

  const continueLink = `<br/><br/><a href="${escapeXml(fullLink)}">${t("rss.continueReading")}</a>`;
  const finalContent = escapeXml(description) + continueLink;

  return `
    <item>
      <title>${escapeXml(post.data.title)}</title>
      <link>${escapeXml(fullLink)}</link>
      <guid isPermaLink="true">${escapeXml(fullLink)}</guid>
      <description>${escapeXml(description)}</description>
      <content:encoded><![CDATA[${finalContent}]]></content:encoded>
      <pubDate>${new Date(post.data.publishedDate).toUTCString()}</pubDate>
      <author>${escapeXml(post.data.authorEmail || "mail@jmrp.io")} (${escapeXml(post.data.author || "José Manuel Requena Plens")})</author>
      ${post.data.tags ? post.data.tags.map((tag: string) => `<category>${escapeXml(tag)}</category>`).join("") : ""}
      ${customData}
    </item>`;
}

/**
 * Generate a complete RSS 2.0 XML feed for a specific locale.
 *
 * @param site - The site origin URL.
 * @param locale - The target locale.
 * @returns A Response with the RSS XML content.
 */
export async function generateRssFeed(
  site: string,
  locale: Locale,
): Promise<Response> {
  const t = useTranslations(locale);
  const year = new Date().getFullYear();
  const pathPrefix = locale === "en" ? "" : `/${locale}`;
  const feedUrl = `${pathPrefix}/rss.xml`;

  const posts = await getCollection("posts");
  const publishedPosts = posts.filter(
    (p) =>
      p.data.lang === locale && (import.meta.env.PROD ? !p.data.draft : true),
  );
  publishedPosts.sort(
    (a, b) =>
      new Date(b.data.publishedDate).getTime() -
      new Date(a.data.publishedDate).getTime(),
  );

  let itemsXml = "";
  for (const post of publishedPosts) {
    itemsXml += await generateRssItem(post, site, locale, pathPrefix);
  }

  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
  xmlns:atom="http://www.w3.org/2005/Atom" 
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${escapeXml(t("seo.rssFeedTitle"))}</title>
    <description>${escapeXml(t("seo.siteDescription"))}</description>
    <link>${escapeXml(site + pathPrefix)}</link>
    <atom:link href="${escapeXml(new URL(feedUrl, site).toString())}" rel="self" type="application/rss+xml" />
    <language>${localeConfig[locale].bcp47.toLowerCase()}</language>
    <copyright>${t("rss.copyright", { year })}</copyright>
    <managingEditor>mail@jmrp.io (José Manuel Requena Plens)</managingEditor>
    <webMaster>mail@jmrp.io (José Manuel Requena Plens)</webMaster>
    <ttl>60</ttl>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>Astro RSS Generator (Manual)</generator>
    <docs>https://www.rssboard.org/rss-specification</docs>
    <image>
      <url>${escapeXml(new URL("/favicon.png", site).toString())}</url>
      <title>${escapeXml(t("seo.rssFeedTitle"))}</title>
      <link>${escapeXml(site + pathPrefix)}</link>
    </image>
    ${itemsXml}
  </channel>
</rss>`;

  return new Response(rssXml, {
    headers: {
      "Content-Type": "application/xml",
    },
  });
}
