import rss from "@astrojs/rss";
import { getCollection, getEntry } from "astro:content";
import { getImage } from "astro:assets";
import type { APIContext } from "astro";
import sanitizeHtml from "sanitize-html";
import { marked } from "marked";

export async function GET(context: APIContext) {
  const posts = await getCollection("posts");
  const siteEntry = await getEntry("site", "config");
  const siteData = siteEntry!.data;

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
    title: `${siteData.author} | Blog`,
    description: siteData.description,
    site: context.site || siteData.url,
    items: await Promise.all(
      publishedPosts.map(async (post) => {
        // Build author string in RFC 822 format: email (Name)
        const authorEmail = post.data.authorEmail || "mail@jmrp.io";
        const authorName = post.data.author || siteData.author;
        const authorString = `${authorEmail} (${authorName})`;

        // Generate full content
        const postBody = post.body || "";
        // Simple cleanup for MDX imports/exports
        // Patterns are anchored (^$) and bounded by newline, safe from ReDoS
        const cleanBody = postBody
          .replaceAll(/^import\s+[^\n]*$/gm, "") // NOSONAR typescript:S5852
          .replaceAll(/^export\s+[^\n]*$/gm, ""); // NOSONAR typescript:S5852

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

        // Resolve cover image
        let enclosure = "";
        if (post.data.coverImage) {
          try {
            const optimizedImage = await getImage({
              src: post.data.coverImage,
              format: "webp",
              width: 1200,
            });
            const imageUrl = new URL(
              optimizedImage.src,
              context.site || siteData.url,
            ).toString();
            enclosure = `<enclosure url="${imageUrl}" length="${optimizedImage.attributes.size || 0}" type="image/webp" />`;
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
          customData: enclosure,
        };
      }),
    ),
    customData: `<language>${siteData.locale.toLowerCase()}</language>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
<atom:link href="${new URL("rss.xml", context.site || siteData.url).toString()}" rel="self" type="application/rss+xml" />`,
    xmlns: {
      atom: "http://www.w3.org/2005/Atom",
      content: "http://purl.org/rss/1.0/modules/content/",
    },
  });
}
