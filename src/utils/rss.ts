/**
 * Shared RSS feed generation utilities.
 *
 * Used by both `/rss.xml` (EN) and `/es/rss.xml` (ES) endpoints
 * to generate locale-specific RSS 2.0 feeds.
 */
import type { Locale } from "@i18n/config";
import { localeConfig } from "@i18n/config";
import { useTranslations } from "@i18n/utils";
import { CC_BY_4_0, licensePageUrl } from "@utils/license";
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
 * The name the covers must be credited to.
 *
 * `/license/` names it literally ("Credit it to \"José Manuel Requena Plens\"")
 * and the rights are the site author's, not the post author's — a post could
 * one day carry a guest byline without the cover changing hands. This file
 * already spells the name out for `<managingEditor>`, `<webMaster>` and the
 * per-item `<author>` fallback; new code reads it from here instead of adding
 * a fourth literal.
 */
const COVER_CREDIT = "José Manuel Requena Plens";

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
  const fullLink = new URL(link, site).href;
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
      const imgUrl = new URL(opt.src, site).href;
      const thumbUrl = new URL(thumb.src, site).href;

      // RSS 2.0 Enclosure (Used by most modern readers for the main image)
      customData += `<enclosure url="${escapeXml(imgUrl)}" length="0" type="image/jpeg" />\n`;

      // The covers' reuse terms, in the one channel that actually redistributes
      // them. The commit that completed the image license metadata put it "in
      // the channel that is read" and named HTML/JSON-LD; that left out Media
      // RSS, which is the only place a cover leaves this origin and lands in
      // someone else's reader (GEO audit 2026-09-02, M4). All three elements
      // are standard Media RSS, and all three restate what /license/ says in
      // prose and what the page's own ImageObject already says in JSON-LD.
      //
      // Scoped inside <media:content> rather than at item level: the item is
      // the article, and an item-level element would also claim to cover any
      // media added here later.
      const coverRights = [
        `<media:credit role="author">${escapeXml(COVER_CREDIT)}</media:credit>`,
        // The post's year, not the build's — a notice that moves on every
        // deploy says the cover was made the day the site last shipped. Same
        // value the ImageObject's `copyrightNotice` carries on the page.
        `<media:copyright url="${escapeXml(licensePageUrl(locale, "covers"))}">© ${post.data.publishedDate.getFullYear()} ${escapeXml(COVER_CREDIT)}</media:copyright>`,
        // The canonical CC BY 4.0 URI, not the localized `deed.es` the Spanish
        // page links for humans: `href` is an identifier a machine matches.
        `<media:license type="text/html" href="${escapeXml(CC_BY_4_0)}">CC BY 4.0</media:license>`,
      ].join("\n      ");

      // Media RSS extensions (Common in Feedly, etc). Emitted whenever there is
      // a cover, with the dimensions as optional attributes: they were the
      // condition for the whole element, so an image whose size Astro could not
      // report would have shipped with no terms at all.
      const dimensions =
        typeof opt.attributes?.width === "number" &&
        typeof opt.attributes?.height === "number"
          ? ` width="${opt.attributes.width}" height="${opt.attributes.height}"`
          : "";
      customData += `<media:content url="${escapeXml(imgUrl)}" medium="image" type="image/jpeg"${dimensions}>\n      ${coverRights}\n      </media:content>\n`;

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

  // The channel <image> declares both dimensions because the DEFAULTS are the
  // trap, not the maximums: RSS 2.0 defaults width to 88 and height to 31, so
  // a reader that honours them renders this square logo squashed into a wide,
  // short box. The spec caps width at 144 and height at 400, which makes
  // 144x144 the largest legal square — and the size generate-brand.mjs emits
  // `favicon.png` at. Kept out of the XML itself: it is guidance for whoever
  // edits this file, and shipping it would spend those bytes on every fetch.
  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
  xmlns:atom="http://www.w3.org/2005/Atom" 
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${escapeXml(t("seo.rssFeedTitle"))}</title>
    <description>${escapeXml(t("seo.siteDescription"))}</description>
    <link>${escapeXml(site + pathPrefix)}</link>
    <atom:link href="${escapeXml(new URL(feedUrl, site).href)}" rel="self" type="application/rss+xml" />
    <language>${localeConfig[locale].bcp47.toLowerCase()}</language>
    <copyright>${t("rss.copyright", { year })}</copyright>
    <managingEditor>mail@jmrp.io (José Manuel Requena Plens)</managingEditor>
    <webMaster>mail@jmrp.io (José Manuel Requena Plens)</webMaster>
    <ttl>60</ttl>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>Astro RSS Generator (Manual)</generator>
    <docs>https://www.rssboard.org/rss-specification</docs>
    <image>
      <url>${escapeXml(new URL("/favicon.png", site).href)}</url>
      <title>${escapeXml(t("seo.rssFeedTitle"))}</title>
      <link>${escapeXml(site + pathPrefix)}</link>
      <width>144</width>
      <height>144</height>
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
