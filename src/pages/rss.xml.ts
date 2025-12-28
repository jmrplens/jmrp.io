import rss from "@astrojs/rss";
import { getCollection, getEntry } from "astro:content";
import { getImage } from "astro:assets";
import type { APIContext } from "astro";
import sanitizeHtml from "sanitize-html";
import { marked } from "marked";

function flattenComponents(content: string): string {
  let flattened = content;

  // 1. TerminalCommand: <TerminalCommand command="..." prompt="..." />
  flattened = flattened.replaceAll(
    /<TerminalCommand\s+([^>]*)\/>/g, // NOSONAR
    (_, attrs) => {
      const command = attrs.match(/command=["']([^"']*)["']/)?.[1] || "";
      const prompt = attrs.match(/prompt=["']([^"']*)["']/)?.[1] || "$";
      return `<div style="background: #1a1b26; color: #a9b1d6; padding: 12px; font-family: monospace; margin: 16px 0;">
<span style="color: #565f89; margin-right: 8px;">${prompt}</span> ${command}
</div>`;
    },
  );

  // 2. FileContent: <FileContent filename="..."> ... </FileContent>
  // Handles balanced tags by searching for the closing tag
  flattened = flattened.replaceAll(
    /<FileContent\s+filename=["']([^"']*)["'][^>]*>([\s\S]*?)<\/FileContent>/g, // NOSONAR
    (_, filename, body) => {
      return `<div style="border: 1px solid #e1e4e8; margin: 16px 0; overflow: hidden;">
<div style="background: #f6f8fa; padding: 8px 16px; border-bottom: 1px solid #e1e4e8; font-family: monospace; font-size: 12px; font-weight: bold;">📄 ${filename}</div>
<div style="padding: 0;">${body}</div>
</div>`;
    },
  );

  // 3. TerminalOutput: <TerminalOutput title="..."> ... </TerminalOutput>
  flattened = flattened.replaceAll(
    /<TerminalOutput\s+title=["']([^"']*)["'][^>]*>([\s\S]*?)<\/TerminalOutput>/g, // NOSONAR
    (_, title, body) => {
      return `<div style="border: 1px solid #e1e4e8; margin: 16px 0; overflow: hidden; background: #fafafa;">
<div style="padding: 8px 16px; border-bottom: 1px solid #e1e4e8; font-family: monospace; font-size: 12px; color: #666;">> ${title}</div>
<div style="padding: 12px; font-family: monospace; font-size: 13px; color: #555;">${body}</div>
</div>`;
    },
  );

  // 4. Callout: <Callout type="..."> ... </Callout>
  flattened = flattened.replaceAll(
    /<Callout\s+type=["']([^"']*)["'][^>]*>([\s\S]*?)<\/Callout>/g, // NOSONAR
    (_, type, body) => {
      const colors: Record<string, string> = {
        info: "#3b82f6",
        warning: "#f59e0b",
        danger: "#ef4444",
        success: "#10b981",
      };
      const color = colors[type] || colors.info;
      return `<div style="padding: 16px; margin: 16px 0; border-left: 4px solid ${color}; background: #f8fafc;">
<strong style="color: ${color}; text-transform: uppercase; font-size: 12px; display: block; margin-bottom: 4px;">${type}</strong>
${body}
</div>`;
    },
  );

  // 5. Collapsible: <Collapsible summary="..."> ... </Collapsible>
  flattened = flattened.replaceAll(
    /<Collapsible\s+summary=["']([^"']*)["'][^>]*>([\s\S]*?)<\/Collapsible>/g, // NOSONAR
    (_, summary, body) => {
      return `<details style="border: 1px solid #e1e4e8; margin: 16px 0;">
<summary style="padding: 12px; cursor: pointer; font-weight: bold; background: #f6f8fa;">${summary}</summary>
<div style="padding: 12px;">${body}</div>
</details>`;
    },
  );

  // 6. Tabs & TabPanel: <Tabs> <TabPanel label="..."> ... </TabPanel> </Tabs>
  // Simple flattening: show all panels with their labels as headers
  flattened = flattened.replaceAll(/<Tabs[^>]*>([\s\S]*?)<\/Tabs>/g, "$1"); // NOSONAR
  flattened = flattened.replaceAll(
    /<TabPanel\s+label=["']([^"']*)["'][^>]*>([\s\S]*?)<\/TabPanel>/g, // NOSONAR
    (_, label, body) => {
      return `<div style="margin: 16px 0; border: 1px solid #e1e4e8;">
<div style="background: #f6f8fa; padding: 4px 12px; border-bottom: 1px solid #e1e4e8; font-size: 12px; color: #666;">Tab: ${label}</div>
<div style="padding: 0;">${body}</div>
</div>`;
    },
  );

  // 7. CompareCode: <CompareCode badTitle="..." goodTitle="..."> <div slot="bad">...</div> <div slot="good">...</div> </CompareCode>
  flattened = flattened.replaceAll(
    /<CompareCode\s+([^>]*?)>([\s\S]*?)<\/CompareCode>/g, // NOSONAR
    (_, attrs, body) => {
      const badTitle = attrs.match(/badTitle=["']([^"']*)["']/)?.[1] || "Bad";
      const goodTitle =
        attrs.match(/goodTitle=["']([^"']*)["']/)?.[1] || "Good";

      // Extract slot content
      const badContent =
        body.match(/<[^>]*slot="bad"[^>]*>([\s\S]*?)<\/[^>]*>/)?.[1] || "";
      const goodContent =
        body.match(/<[^>]*slot="good"[^>]*>([\s\S]*?)<\/[^>]*>/)?.[1] || "";

      return `<div style="margin: 24px 0;">
<div style="border: 1px solid #ef4444; margin-bottom: 12px;">
<div style="background: #ef4444; color: white; padding: 4px 12px; font-weight: bold; font-size: 13px;">✕ ${badTitle}</div>
<div style="padding: 0;">${badContent}</div>
</div>
<div style="border: 1px solid #10b981;">
<div style="background: #10b981; color: white; padding: 4px 12px; font-weight: bold; font-size: 13px;">✓ ${goodTitle}</div>
<div style="padding: 0;">${goodContent}</div>
</div>
</div>`;
    },
  );

  // 8. YouTube: <YouTube id="..." title="..." />
  flattened = flattened.replaceAll(/<YouTube\s+([^>]*)\/>/g, (_, attrs) => {
    // NOSONAR
    const id = attrs.match(/id=["']([^"']*)["']/)?.[1] || "";
    const title = attrs.match(/title=["']([^"']*)["']/)?.[1] || "Video";
    const url = `https://www.youtube.com/watch?v=${id}`;
    return `<div style="margin: 16px 0; text-align: center; border: 1px solid #e1e4e8; padding: 20px; background: #f9f9f9;">
<p style="margin-bottom: 10px;">📺 <strong>${title}</strong></p>
<a href="${url}" style="color: #B509AC; text-decoration: underline;">Watch on YouTube</a>
</div>`;
  });

  // 9. Mermaid Render: ```mermaid-render ... ```
  flattened = flattened.replaceAll(
    /```mermaid-render([\s\S]*?)```/g, // NOSONAR
    "<blockquote>[Diagram not renderable in RSS. Visit site to view]</blockquote>",
  );

  // 10. Generic Cleanup
  flattened = flattened
    .replaceAll(/^import\s+[^;]*;?$/gm, "") // NOSONAR
    .replaceAll(/^export\s+[^;]*;?$/gm, "") // NOSONAR
    .replaceAll(/{\/\*[\s\S]*?\*\/}/g, "") // NOSONAR
    .replaceAll(/{[^}]*}/g, ""); // NOSONAR

  return flattened;
}

export async function GET(context: APIContext) {
  const posts = await getCollection("posts");
  const siteEntry = await getEntry("site_config", "site");
  const siteData = siteEntry?.data;

  // Filter out draft posts in production
  const publishedPosts = posts.filter((post: any) => {
    if (import.meta.env.PROD) {
      return !post.data.draft;
    }
    return true;
  });

  // Sort by publication date (newest first)
  publishedPosts.sort((a: any, b: any) => {
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
      publishedPosts.map(async (post: any) => {
        // Build author string in RFC 822 format: email (Name)
        const authorEmail = post.data.authorEmail || "mail@jmrp.io";
        const authorName = post.data.author || "José Manuel Requena Plens";
        const authorString = `${authorEmail} (${authorName})`;

        // Flatten MDX components to HTML
        const postBody = post.body || "";
        const flattenedBody = flattenComponents(postBody);

        const html = await marked.parse(flattenedBody);
        const sanitizedHtml = sanitizeHtml(html, {
          allowedTags: sanitizeHtml.defaults.allowedTags.concat([
            "img",
            "pre",
            "code",
            "span",
            "details",
            "summary",
            "blockquote",
            "strong",
            "p",
            "div",
          ]),
          allowedAttributes: {
            ...sanitizeHtml.defaults.allowedAttributes,
            img: ["src", "alt", "title", "width", "height"],
            a: ["href", "name", "target", "title", "rel"],
            code: ["class"],
            span: ["class", "style"],
            div: ["style"],
            p: ["style"],
            details: ["style"],
            summary: ["style"],
            strong: ["style"],
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
