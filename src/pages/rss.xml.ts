import rss from "@astrojs/rss";
import { getCollection, getEntry, type CollectionEntry } from "astro:content";
import { getImage } from "astro:assets";
import type { APIContext } from "astro";
import sanitizeHtml from "sanitize-html";
import { marked } from "marked";
import juice from "juice";
import fs from "node:fs";
import path from "node:path";

const RSS_STYLES = fs.readFileSync(path.resolve("src/styles/rss.css"), "utf-8");

function flattenComponents(content: string): string {
  let flattened = content;

  // 1. TerminalCommand
  flattened = flattened.replaceAll(
    /<TerminalCommand\s+([^>]*)\/?>/g,
    (_, attrs) => {
      const command = attrs.match(/command=["']([^"']*)["']/)?.["1"] || "";
      const prompt = attrs.match(/prompt=["']([^"']*)["']/)?.["1"] || "$";
      return `<div style="background: #1a1b26; color: #a9b1d6; padding: 12px; font-family: monospace; margin: 16px 0;">
<span style="color: #565f89; margin-right: 8px;">${prompt}</span> ${command}
</div>`;
    },
  );

  // 2. FileContent
  flattened = flattened.replaceAll(
    /<FileContent\s+filename=["']([^"']*)["'][^>]*>([\s\S]*?)<\/FileContent>/g,
    (_, filename, body) => {
      return `<div style="border: 1px solid #e1e4e8; margin: 16px 0; overflow: hidden;">
<div style="background: #f6f8fa; padding: 8px 16px; border-bottom: 1px solid #e1e4e8; font-family: monospace; font-size: 12px; font-weight: bold;">📄 ${filename}</div>
<div style="padding: 0;">${body}</div>
</div>`;
    },
  );

  // 3. TerminalOutput
  flattened = flattened.replaceAll(
    /<TerminalOutput\s+title=["']([^"']*)["'][^>]*>([\s\S]*?)<\/TerminalOutput>/g,
    (_, title, body) => {
      return `<div style="border: 1px solid #e1e4e8; margin: 16px 0; overflow: hidden; background: #fafafa;">
<div style="padding: 8px 16px; border-bottom: 1px solid #e1e4e8; font-family: monospace; font-size: 12px; color: #666;">> ${title}</div>
<div style="padding: 12px; font-family: monospace; font-size: 13px; color: #555;">${body}</div>
</div>`;
    },
  );

  // 4. Callout
  flattened = flattened.replaceAll(
    /<Callout\s+type=["']([^"']*)["'][^>]*>([\s\S]*?)<\/Callout>/g,
    (_, type, body) => {
      const colors: Record<string, string> = {
        info: "#3b82f6",
        warning: "#f59e0b",
        danger: "#ef4444",
        success: "#10b981",
      };
      const color = colors[type] || colors.info;
      return `<div style="padding: 16px; margin: 16px 0; border-left: 4px solid ${color}; background: #f8fafc;">
<strong style="color: ${color}; font-size: 12px; display: block; margin-bottom: 4px;">${type.toUpperCase()}</strong>
${body}
</div>`;
    },
  );

  // 5. Collapsible
  flattened = flattened.replaceAll(
    /<Collapsible\s+summary=["']([^"']*)["'][^>]*>([\s\S]*?)<\/Collapsible>/g,
    (_, summary, body) => {
      return `<details style="border: 1px solid #e1e4e8; margin: 16px 0;">
<summary style="padding: 12px; cursor: pointer; font-weight: bold; background: #f6f8fa;">${summary}</summary>
<div style="padding: 12px;">${body}</div>
</details>`;
    },
  );

  // 6. Tabs & TabPanel
  flattened = flattened.replaceAll(/<Tabs[^>]*>([\s\S]*?)<\/Tabs>/g, "$1");
  flattened = flattened.replaceAll(
    /<TabPanel\s+label=["']([^"']*)["'][^>]*>([\s\S]*?)<\/TabPanel>/g,
    (_, label, body) => {
      return `<div style="margin: 16px 0; border: 1px solid #e1e4e8;">
<div style="background: #f6f8fa; padding: 4px 12px; border-bottom: 1px solid #e1e4e8; font-size: 12px; color: #666;">Tab: ${label}</div>
<div style="padding: 0;">${body}</div>
</div>`;
    },
  );

  // 7. CompareCode
  flattened = flattened.replaceAll(
    /<CompareCode\s+([^>]*?)>([\s\S]*?)<\/CompareCode>/g,
    (_, attrs, body) => {
      const badTitle = attrs.match(/badTitle=["']([^"']*)["']/)?.["1"] || "Bad";
      const goodTitle =
        attrs.match(/goodTitle=["']([^"']*)["']/)?.["1"] || "Good";

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

  // 8. YouTube
  flattened = flattened.replaceAll(/<YouTube\s+([^>]*)\inaly/g, (_, attrs) => {
    const id = attrs.match(/id=["']([^"']*)["']/)?.["1"] || "";
    const title = attrs.match(/title=["']([^"']*)["']/)?.["1"] || "Video";
    const url = `https://www.youtube.com/watch?v=${id}`;
    return `<div style="margin: 16px 0; text-align: center; border: 1px solid #e1e4e8; padding: 20px; background: #f9f9f9;">
<p style="margin-bottom: 10px;">📺 <strong>${title}</strong></p>
<a href="${url}" style="color: #B509AC; text-decoration: underline;">Watch on YouTube</a>
</div>`;
  });

  // 9. Mermaid Render
  flattened = flattened.replaceAll(
    /```mermaid-render([\s\S]*?)```/g,
    "<blockquote>[Diagram not renderable in RSS. Visit site to view]</blockquote>",
  );

  // 10. Generic Cleanup
  flattened = flattened
    .replaceAll(/^import\s+[^;]*;?$/gm, "")
    .replaceAll(/^export\s+[^;]*;?$/gm, "")
    .replaceAll(/{\/\*[\s\S]*?\*\/}/g, "")
    .replaceAll(/\{[a-zA-Z_$][\w.$]*\}/g, "");

  return flattened;
}

export async function GET(context: APIContext) {
  const posts = await getCollection("posts");
  const siteEntry = await getEntry("site_config", "site");
  const siteData = siteEntry?.data;

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
    site: context.site || "https://jmrp.io",
    items: await Promise.all(
      publishedPosts.map(async (post) => {
        const author = `${post.data.authorEmail || "mail@jmrp.io"} (${post.data.author || "José Manuel Requena Plens"})`;

        // Use the simpler, synchronous component flattening
        const flattenedBody = flattenComponents(post.body || "");

        const html = await marked.parse(flattenedBody);
        
        const cleanHtml = sanitizeHtml(html, {
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
            "h1", "h2", "h3", "h4", "h5", "h6",
            "ul", "ol", "li", "a", "table", "thead", "tbody", "tr", "th", "td",
            "hr", "br", "b", "i", "em", "u"
          ]),
          allowedAttributes: {
            ...sanitizeHtml.defaults.allowedAttributes,
            img: ["src", "alt", "title", "width", "height", "style"],
            a: ["href", "name", "target", "title", "rel", "style"],
            code: ["class", "style"],
            span: ["class", "style"],
            div: ["style"],
            p: ["style"],
            details: ["style", "open"],
            summary: ["style"],
            strong: ["style"],
            h1: ["style"], h2: ["style"], h3: ["style"], h4: ["style"], h5: ["style"], h6: ["style"],
            ul: ["style"], ol: ["style"], li: ["style"],
            table: ["style"], th: ["style"], td: ["style"],
            blockquote: ["style"],
            pre: ["style", "class"],
          },
        });

        const styledHtml = juice(cleanHtml, {
          extraCss: RSS_STYLES,
          applyStyleTags: false,
          removeStyleTags: true,
          preserveMediaQueries: true,
          preserveFontFaces: false,
          insertPreservedExtraCss: false,
        });

        let finalContent = styledHtml;
        let customItemData = "";
        let enclosure = undefined;

        if (post.data.coverImage) {
          try {
            const opt = await getImage({
              src: post.data.coverImage,
              format: "jpg",
              width: 1200,
            });
            const thumb = await getImage({
              src: post.data.coverImage,
              format: "jpg",
              width: 400,
            });
            const imgUrl = new URL(
              opt.src,
              context.site || "https://jmrp.io",
            ).toString();
            const thumbUrl = new URL(
              thumb.src,
              context.site || "https://jmrp.io",
            ).toString();

            const imageHtml = `<img src="${imgUrl}" alt="${post.data.title}" width="${opt.attributes.width}" height="${opt.attributes.height}" style="display: block; margin-bottom: 24px; border-radius: 8px; max-width: 100%; height: auto;" />`;
            finalContent = `${imageHtml}${styledHtml}`;

            enclosure = {
              url: imgUrl,
              length: 65535,
              type: "image/jpeg",
            };

            customItemData += `<media:content url="${imgUrl}" medium="image" type="image/jpeg" width="${opt.attributes.width}" height="${opt.attributes.height}" isDefault="true" />\n<media:thumbnail url="${thumbUrl}" width="${thumb.attributes.width}" height="${thumb.attributes.height}" />`;
          } catch (e) {
            console.warn("[RSS] Image optimization failed:", e);
          }
        }

        return {
          title: post.data.title,
          description: post.data.description || "",
          pubDate: new Date(post.data.publishedDate),
          link: `/blog/${post.slug}/`,
          categories: post.data.tags || [],
          author,
          content: finalContent,
          enclosure,
          customData: customItemData,
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
      media: "http://search.yahoo.com/mrss/",
    },
  });
}