import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { getImage } from "astro:assets";
import type { APIContext } from "astro";
import sanitizeHtml from "sanitize-html";
import { marked } from "marked";

export async function GET(context: APIContext) {
  const posts = await getCollection("posts");

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
    title: "José Manuel Requena Plens | Blog",
    description:
      "Technical blog on R&D, Embedded Systems, Software Engineering, and Acoustics",
    site: context.site || "https://jmrp.io",
    items: await Promise.all(
      publishedPosts.map(async (post) => {
        // Build author string in RFC 822 format: email (Name)
        const authorEmail = post.data.authorEmail || "mail@jmrp.io";
        const authorName = post.data.author || "José Manuel Requena Plens";
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
              context.site || "https://jmrp.io",
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
    customData: `<language>en-us</language>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
<atom:link href="${new URL("rss.xml", context.site || "https://jmrp.io").toString()}" rel="self" type="application/rss+xml" />`,
    xmlns: {
      atom: "http://www.w3.org/2005/Atom",
      content: "http://purl.org/rss/1.0/modules/content/",
    },
  });
}
