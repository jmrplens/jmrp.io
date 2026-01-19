import rss from "@astrojs/rss";
import { getImage } from "astro:assets";
import { getCollection, getEntry } from "astro:content";

/**
 * Represents basic site metadata used for RSS feed generation.
 */
interface SiteData {
  title: string;
  description: string;
  author: string;
  locale: string;
}

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

  return rss({
    title: siteData?.title || "José Manuel Requena Plens | Blog",
    description: siteData?.description || "Technical blog",
    site: site,
    items: await Promise.all(
      publishedPosts.map(async (post) => {
        const link = `/blog/${post.data.slug}/`;
        const fullLink = new URL(link, site).toString();
        let customData = "";
        const description =
          post.data.description ||
          "Academic and R&D Portfolio of José Manuel Requena Plens. Specializing in Embedded Systems, Acoustics, and Industrial Software Development.";

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
            customData += `<enclosure url="${imgUrl}" length="0" type="image/jpeg" />\n`;

            // Media RSS extensions (Common in Feedly, etc)
            if (
              typeof opt.attributes?.width === "number" &&
              typeof opt.attributes?.height === "number"
            ) {
              customData += `<media:content url="${imgUrl}" medium="image" type="image/jpeg" width="${opt.attributes.width}" height="${opt.attributes.height}" />\n`;
            }

            if (
              typeof thumb.attributes?.width === "number" &&
              typeof thumb.attributes?.height === "number"
            ) {
              customData += `<media:thumbnail url="${thumbUrl}" width="${thumb.attributes.width}" height="${thumb.attributes.height}" />\n`;
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            console.warn(
              `[RSS] Cover image process failed for ${post.id}: ${message}`,
            );
          }
        }

        // Add "Continue Reading" link to description/content
        // Some readers prefer 'content:encoded', others 'description'. We can populate both with the same summary + link.
        const continueLink = `<br/><br/><a href="${fullLink}">Continue reading on jmrp.io &rarr;</a>`;
        const finalContent = description + continueLink;

        return {
          title: post.data.title,
          description: description, // Plain text description
          pubDate: new Date(post.data.publishedDate),
          link: link,
          categories: post.data.tags || [],
          author: `${post.data.authorEmail || "mail@jmrp.io"} (${post.data.author || "José Manuel Requena Plens"})`,
          content: finalContent, // HTML content with link
          customData: customData,
        };
      }),
    ),
    customData: `<atom:link href="${new URL("rss.xml", site).toString()}" rel="self" type="application/rss+xml" />
<language>${siteData?.locale ? siteData.locale.replaceAll("_", "-").toLowerCase() : "en-us"}</language>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
<generator>Astro RSS Generator</generator>`,
    xmlns: {
      atom: "http://www.w3.org/2005/Atom",
      content: "http://purl.org/rss/1.0/modules/content/",
      media: "http://search.yahoo.com/mrss/", // NOSONAR
    },
  });
}
