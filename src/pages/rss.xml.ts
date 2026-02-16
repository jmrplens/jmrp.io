import { getImage } from "astro:assets";
import { type CollectionEntry, getCollection, getEntry } from "astro:content";

/**
 * Represents basic site metadata used for RSS feed generation.
 */
interface SiteData {
  title: string;
  description: string;
  author: string;
  locale: string;
}

const escapeXml = (unsafe: string) => {
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

const generateRssItem = async (
  post: CollectionEntry<"posts">,
  site: string,
) => {
  const link = `/blog/${post.data.slug}/`;
  const fullLink = new URL(link, site).toString();
  const description =
    post.data.description ||
    "Academic and R&D Portfolio of José Manuel Requena Plens. Specializing in Embedded Systems, Acoustics, and Industrial Software Development.";

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
      // Use "0" as a safe default for file size since we can't accurately determine
      // the final JPEG file size from image dimensions alone.
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

  // Add "Continue Reading" link to description/content
  // Some readers prefer 'content:encoded', others 'description'. We can populate both with the same summary + link.
  const continueLink = `<br/><br/><a href="${escapeXml(fullLink)}">Continue reading on jmrp.io &rarr;</a>`;
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
      ${post.data.tags ? post.data.tags.map((t: string) => `<category>${escapeXml(t)}</category>`).join("") : ""}
      ${customData}
    </item>`;
};

/**
 * Endpoint for generating the site's RSS 2.0 feed.
 *
 * Includes full support for:
 * - Content collections (blog posts).
 * - Enclosures and Media RSS (thumbnails/hero images).
 * - Proper escaping and "Continue Reading" links for better reader compatibility.
 * - Automatic filtering of draft posts in production.
 */
export async function GET(context: { site: URL }) {
  const posts = await getCollection("posts");
  const siteEntry = await getEntry("site_config", "site");

  // Type-safe site data extraction with validation
  if (!siteEntry?.data) {
    throw new Error("Site configuration not found");
  }

  const siteData = siteEntry.data as SiteData;
  const site = context.site.origin; // Use origin to avoid trailing slash issues if any

  const publishedPosts = posts.filter((p) =>
    import.meta.env.PROD ? !p.data.draft : true,
  );
  publishedPosts.sort(
    (a, b) =>
      new Date(b.data.publishedDate).getTime() -
      new Date(a.data.publishedDate).getTime(),
  );

  let itemsXml = "";
  for (const post of publishedPosts) {
    itemsXml += await generateRssItem(post, site);
  }

  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
  xmlns:atom="http://www.w3.org/2005/Atom" 
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${escapeXml(siteData?.title || "José Manuel Requena Plens | Blog")}</title>
    <description>${escapeXml(siteData?.description || "Technical blog")}</description>
    <link>${escapeXml(site)}</link>
    <atom:link href="${escapeXml(new URL("rss.xml", site).toString())}" rel="self" type="application/rss+xml" />
    <language>${siteData?.locale ? siteData.locale.replaceAll("_", "-").toLowerCase() : "en-us"}</language>
    <copyright>Copyright ${new Date().getFullYear()}, José Manuel Requena Plens</copyright>
    <managingEditor>mail@jmrp.io (José Manuel Requena Plens)</managingEditor>
    <webMaster>mail@jmrp.io (José Manuel Requena Plens)</webMaster>
    <ttl>60</ttl>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>Astro RSS Generator (Manual)</generator>
    <docs>https://www.rssboard.org/rss-specification</docs>
    <image>
      <url>${escapeXml(new URL("/favicon.png", site).toString())}</url>
      <title>${escapeXml(siteData?.title || "José Manuel Requena Plens | Blog")}</title>
      <link>${escapeXml(site)}</link>
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
