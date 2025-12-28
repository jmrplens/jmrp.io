import rss from "@astrojs/rss";
import { getCollection, getEntry } from "astro:content";
import { getImage } from "astro:assets";
import type { APIContext } from "astro";
import sanitizeHtml from "sanitize-html";
import { marked } from "marked";

export async function GET(context: APIContext) {
  const posts = await getCollection("posts");
  const siteEntry = await getEntry("site_config", "site");
  const siteData = siteEntry?.data;

  // Filter out draft posts in production
  const publishedPosts = posts.filter((post) => {
    if (import.meta.env.PROD) {
      return !post.data.draft;
    }
    return true;
  });

  // Sort by publication date (newest first)
  publishedPosts.sort((a, b) => {
    return (
      new Date(b.data.publishedDate).getTime() -
      new Date(a.data.publishedDate).getTime()
    );
  });

  return rss({
    title: siteData?.title || "José Manuel Requena Plens | Blog",
    description: siteData?.description || "Technical blog",
    site: context.site || "https://jmrp.io",
    items: await Promise.all(
      publishedPosts.map(async (post) => {
        // Build author string in RFC 822 format: email (Name)
        const authorEmail = post.data.authorEmail || "mail@jmrp.io";
        const authorName = post.data.author || "José Manuel Requena Plens";
        const authorString = `${authorEmail} (${authorName})`;

        // Generate full content
        const postBody = post.body || "";
        const cleanBody = postBody
          .replaceAll(/^import\s+[^\n]*$/gm, "")
          .replaceAll(/^export\s+[^\n]*$/gm, "");

        const html = await marked.parse(cleanBody);
        const sanitizedHtml = sanitizeHtml(html, {
          allowedTags: sanitizeHtml.defaults.allowedTags.concat([
            "img",
            "pre",
            "code",
            "span",
          ]),
          allowedAttributes: {
            ...sanitizeHtml.defaults.allowedAttributes,
            img: ["src", "alt", "title", "width", "height"],
            a: ["href", "name", "target", "title", "rel"],
            code: ["class"],
            span: ["class", "style"],
          },
        });

        // Generate Media RSS and Enclosure data
        let customItemData = "";
        if (post.data.coverImage) {
          try {
            const optimizedImage = await getImage({
              src: post.data.coverImage,
              format: "webp",
              width: 1200,
            });
            const thumbnailImage = await getImage({
              src: post.data.coverImage,
              format: "webp",
              width: 400,
            });

            const imageUrl = new URL(
              optimizedImage.src,
              context.site || "https://jmrp.io",
            ).toString();
            const thumbUrl = new URL(
              thumbnailImage.src,
              context.site || "https://jmrp.io",
            ).toString();

            customItemData += `<enclosure url="${imageUrl}" length="${optimizedImage.attributes.size || 0}" type="image/webp" />\n`;
            customItemData += `<media:content url="${imageUrl}" medium="image" type="image/webp" width="${optimizedImage.attributes.width}" height="${optimizedImage.attributes.height}" />\n`;
            customItemData += `<media:thumbnail url="${thumbUrl}" width="${thumbnailImage.attributes.width}" height="${thumbnailImage.attributes.height}" />`;
          } catch (e) {
            console.warn(`Failed to optimize RSS image for ${post.slug}`, e);
          }
        }

        return {
          title: post.data.title,
          description: post.data.description || "",
          pubDate: new Date(post.data.publishedDate),
          link: `/blog/${post.slug}/`,
          categories: post.data.tags || [],
          author: authorString,
          content: sanitizedHtml,
          customData: customItemData,
        };
      }),
    ),
    customData: `<language>${siteData?.locale?.replace("_", "-").toLowerCase() || "en-us"}</language>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
<generator>Astro RSS Generator</generator>
<atom:link href="${new URL("rss.xml", context.site || "https://jmrp.io").toString()}" rel="self" type="application/rss+xml" />`,
    xmlns: {
      atom: "http://www.w3.org/2005/Atom",
      content: "http://purl.org/rss/1.0/modules/content/",
      media: "http://search.yahoo.com/mrss/",
    },
  });
}
