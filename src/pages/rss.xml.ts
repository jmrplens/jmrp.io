import rss from "@astrojs/rss";
import { getCollection, getEntry } from "astro:content";
import { getImage } from "astro:assets";
import type { APIContext } from "astro";
import { escapeHtml } from "../../scripts/utils/html.mjs";

interface SiteData {
  title: string;
  description: string;
  author: string;
  locale: string;
}

export async function GET(context: APIContext) {
  const posts = await getCollection("posts");
  const siteEntry = await getEntry("site_config", "site");
  const siteData = siteEntry?.data as unknown as SiteData;
  const publishedPosts = posts.filter((p) => (import.meta.env.PROD ? !p.data.draft : true));
  publishedPosts.sort((a, b) => new Date(b.data.publishedDate).getTime() - new Date(a.data.publishedDate).getTime());

  return rss({
    title: siteData?.title || "José Manuel Requena Plens | Blog",
    description: siteData?.description || "Technical blog",
    site: context.site || "https://jmrp.io",
    items: await Promise.all(
      publishedPosts.map(async (post) => {
        const link = `/blog/${post.slug}/`;
        const fullLink = new URL(link, context.site || "https://jmrp.io").toString();
        let customData = "";
        const description =
          "Academic and R&D Portfolio of José Manuel Requena Plens. Specializing in Embedded Systems, Acoustics, and Industrial Software Development.";

        // Add correct cover image enclosure (compliant with RSS readers)
        if (post.data.coverImage) {
          try {
            const opt = await getImage({ src: post.data.coverImage, format: "jpeg", width: 1200 });
            const thumb = await getImage({ src: post.data.coverImage, format: "jpeg", width: 400 });
            // JPEG chosen over WebP for maximum compatibility with RSS readers
            const imgUrl = new URL(opt.src, context.site || "https://jmrp.io").toString();
            const thumbUrl = new URL(thumb.src, context.site || "https://jmrp.io").toString();

            // RSS 2.0 Enclosure (Used by most modern readers for the main image)
            // Estimate file size in bytes from image dimensions (3 bytes per pixel) to provide a non-zero length.
            const estimatedLength =
              typeof opt.attributes?.width === "number" && typeof opt.attributes?.height === "number"
                ? (opt.attributes.width * opt.attributes.height * 3).toString()
                : "0";
            customData += `<enclosure url="${imgUrl}" length="${estimatedLength}" type="image/jpeg" />\n`;

            // Media RSS extensions (Common in Feedly, etc)
            customData += `<media:content url="${imgUrl}" medium="image" type="image/jpeg" width="${opt.attributes.width}" height="${opt.attributes.height}" />\n`;
            customData += `<media:thumbnail url="${thumbUrl}" width="${thumb.attributes.width}" height="${thumb.attributes.height}" />\n`;
          } catch (e) {
            console.warn("[RSS] Cover image process failed:", e);
          }
        }

        // Add "Continue Reading" link to description/content
        // Some readers prefer 'content:encoded', others 'description'. We can populate both with the same summary + link.
        const continueLink = `<br/><br/><a href="${fullLink}">Continue reading on jmrp.io &rarr;</a>`;
        const finalContent = escapeHtml(description) + continueLink;

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
    customData: `<language>${siteData?.locale?.replaceAll("_", "-").toLowerCase() || "en-us"}</language>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
<generator>Astro RSS Generator</generator>
<atom:link href="${new URL("rss.xml", context.site || "https://jmrp.io").toString()}" rel="self" type="application/rss+xml" />`,
    xmlns: {
      atom: "http://www.w3.org/2005/Atom",
      content: "http://purl.org/rss/1.0/modules/content/",
      media: "http://search.yahoo.com/mrss/", // NOSONAR
    },
  });
}