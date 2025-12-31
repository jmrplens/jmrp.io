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

// Helper to parse Markdown content inside components
async function parseInnerMarkdown(content: string): Promise<string> {
  if (!content) return "";
  // Remove leading/trailing whitespace to avoid block-level confusion if possible,
  // but marked expects newlines for blocks.
  // We use marked.parse directly.
  return await marked.parse(content);
}

async function flattenComponents(content: string): Promise<string> {
  let flattened = content;

  // 1. TerminalCommand: <TerminalCommand command="..." prompt="..." />
  flattened = flattened.replaceAll(
    /<TerminalCommand\s+([^>]*)\/?>/g, // NOSONAR
    (_, attrs) => {
      const command = attrs.match(/command=["']([^"']*)["']/)?.[1] || "";
      const prompt = attrs.match(/prompt=["']([^"']*)["']/)?.[1] || "$";
      // Ensure command is escaped/safe if needed, but it's usually code
      return `<div style="background: #1a1b26; color: #a9b1d6; padding: 12px; font-family: monospace; margin: 16px 0;">
<span style="color: #565f89; margin-right: 8px;">${prompt}</span> ${command}
</div>`;
    },
  );

  // 2. FileContent: <FileContent filename="..."> ... </FileContent>
  // We need to match and replace async because we want to parse the inner body
  // replaceAll with async function is not supported directly for string replacement in this way easily without a loop or library
  // We will use a loop to handle async parsing.
  
  // Actually, we can't make flattenComponents async easily if we use replaceAll with string return.
  // But we CAN make flattenComponents async and use a custom replacement loop.
  
  // Helper for async replacement
  const replaceAsync = async (str: string, regex: RegExp, asyncFn: (match: RegExpExecArray) => Promise<string>) => {
      const promises: Promise<string>[] = [];
      str.replace(regex, (match, ...args) => {
          // Reconstruct the full match array slightly differently but close enough
          // replace callback args are: match, p1, p2, ..., offset, string
          // We can just use the full match from regex.exec logic or accept that we only need groups.
          // Let's use matchAll instead.
          return match;
      });
      
      const matches = Array.from(str.matchAll(regex));
      for (const match of matches) {
          promises.push(asyncFn(match));
      }
      const data = await Promise.all(promises);
      let i = 0;
      return str.replace(regex, () => data[i++]);
  }

  // 2. FileContent
  flattened = await replaceAsync(flattened, /<FileContent\s+filename=["']([^"']*)["'][^>]*>([\s\S]*?)<\/FileContent>/g, async (match) => {
      const filename = match[1];
      const body = match[2];
      const parsedBody = await parseInnerMarkdown(body);
      return `<div style="border: 1px solid #e1e4e8; margin: 16px 0; overflow: hidden;">
<div style="background: #f6f8fa; padding: 8px 16px; border-bottom: 1px solid #e1e4e8; font-family: monospace; font-size: 12px; font-weight: bold;">📄 ${filename}</div>
<div style="padding: 0;">${parsedBody}</div>
</div>`;
  });

  // 3. TerminalOutput
  flattened = await replaceAsync(flattened, /<TerminalOutput\s+title=["']([^"']*)["'][^>]*>([\s\S]*?)<\/TerminalOutput>/g, async (match) => {
      const title = match[1];
      const body = match[2];
      // Terminal output is usually code/text, we might NOT want to parse markdown inside it?
      // Usually it's inside <pre> in the component. 
      // If we assume it's pre-formatted:
      return `<div style="border: 1px solid #e1e4e8; margin: 16px 0; overflow: hidden; background: #fafafa;">
<div style="padding: 8px 16px; border-bottom: 1px solid #e1e4e8; font-family: monospace; font-size: 12px; color: #666;">> ${title}</div>
<div style="padding: 12px; font-family: monospace; font-size: 13px; color: #555; white-space: pre-wrap;">${body}</div>
</div>`;
  });

  // 4. Callout
  flattened = await replaceAsync(flattened, /<Callout\s+type=["']([^"']*)["'][^>]*>([\s\S]*?)<\/Callout>/g, async (match) => {
      const type = match[1];
      const body = match[2];
      const parsedBody = await parseInnerMarkdown(body);
      const colors: Record<string, string> = {
        info: "#3b82f6",
        warning: "#f59e0b",
        danger: "#ef4444",
        success: "#10b981",
      };
      const color = colors[type] || colors.info;
      return `<div style="padding: 16px; margin: 16px 0; border-left: 4px solid ${color}; background: #f8fafc;">
<strong style="color: ${color}; font-size: 12px; display: block; margin-bottom: 4px;">${type.toUpperCase()}</strong>
<div>${parsedBody}</div>
</div>`;
  });

  // 5. Collapsible
  flattened = await replaceAsync(flattened, /<Collapsible\s+summary=["']([^"']*)["'][^>]*>([\s\S]*?)<\/Collapsible>/g, async (match) => {
      const summary = match[1];
      const body = match[2];
      const parsedBody = await parseInnerMarkdown(body);
      return `<details style="border: 1px solid #e1e4e8; margin: 16px 0;">
<summary style="padding: 12px; cursor: pointer; font-weight: bold; background: #f6f8fa;">${summary}</summary>
<div style="padding: 12px;">${parsedBody}</div>
</details>`;
  });

  // 6. Tabs & TabPanel
  flattened = flattened.replaceAll(/<Tabs[^>]*>([\s\S]*?)<\/Tabs>/g, "$1");
  flattened = await replaceAsync(flattened, /<TabPanel\s+label=["']([^"']*)["'][^>]*>([\s\S]*?)<\/TabPanel>/g, async (match) => {
      const label = match[1];
      const body = match[2];
      const parsedBody = await parseInnerMarkdown(body);
      return `<div style="margin: 16px 0; border: 1px solid #e1e4e8;">
<div style="background: #f6f8fa; padding: 4px 12px; border-bottom: 1px solid #e1e4e8; font-size: 12px; color: #666;">Tab: ${label}</div>
<div style="padding: 0;">${parsedBody}</div>
</div>`;
  });

  // 7. CompareCode
  flattened = await replaceAsync(flattened, /<CompareCode\s+([^>]*?)>([\s\S]*?)<\/CompareCode>/g, async (match) => {
      const attrs = match[1];
      const body = match[2];
      const badTitle = attrs.match(/badTitle=["']([^"']*)["']/)?.[1] || "Bad";
      const goodTitle = attrs.match(/goodTitle=["']([^"']*)["']/)?.[1] || "Good";

      const badContent = body.match(/<[^>]*slot="bad"[^>]*>([\s\S]*?)<\/[^>]*>/)?.[1] || "";
      const goodContent = body.match(/<[^>]*slot="good"[^>]*>([\s\S]*?)<\/[^>]*>/)?.[1] || "";
      
      const parsedBad = await parseInnerMarkdown(badContent);
      const parsedGood = await parseInnerMarkdown(goodContent);

      return `<div style="margin: 24px 0;">
<div style="border: 1px solid #ef4444; margin-bottom: 12px;">
<div style="background: #ef4444; color: white; padding: 4px 12px; font-weight: bold; font-size: 13px;">✕ ${badTitle}</div>
<div style="padding: 0;">${parsedBad}</div>
</div>
<div style="border: 1px solid #10b981;">
<div style="background: #10b981; color: white; padding: 4px 12px; font-weight: bold; font-size: 13px;">✓ ${goodTitle}</div>
<div style="padding: 0;">${parsedGood}</div>
</div>
</div>`;
  });

  // 8. YouTube (No markdown inside)
  flattened = flattened.replaceAll(/<YouTube\s+([^>]*)\/?>/g, (_, attrs) => { // NOSONAR
    const id = attrs.match(/id=["']([^"']*)["']/)?.[1] || ""; // NOSONAR
    const title = attrs.match(/title=["']([^"']*)["']/)?.[1] || "Video"; // NOSONAR
    const url = `https://www.youtube.com/watch?v=${id}`;
    return `<div style="margin: 16px 0; text-align: center; border: 1px solid #e1e4e8; padding: 20px; background: #f9f9f9;">
<p style="margin-bottom: 10px;">📺 <strong>${title}</strong></p>
<a href="${url}" style="color: #B509AC; text-decoration: underline;">Watch on YouTube</a>
</div>`;
  });

  // 9. Mermaid Render
  flattened = flattened.replaceAll(
    /```mermaid-render([\s\S]*?)```/g, // NOSONAR
    "<blockquote>[Diagram not renderable in RSS. Visit site to view]</blockquote>",
  );

  // 10. Generic Cleanup
  flattened = flattened
    .replaceAll(/^import\s+[^;]*;?$/gm, "") // NOSONAR
    .replaceAll(/^export\s+[^;]*;?$/gm, "") // NOSONAR
    .replaceAll(/{\/\*[\s\S]*?\*\/}/g, "") // NOSONAR
    .replaceAll(/\{[a-zA-Z_$][\w.$]*\}/g, ""); // NOSONAR

  return flattened;
}

export async function GET(context: APIContext) {
  const posts = await getCollection("posts");
  const siteEntry = await getEntry("site_config", "site");
  const siteData = siteEntry?.data;

  const publishedPosts = posts.filter((post: CollectionEntry<"posts">) => {
    if (import.meta.env.PROD) {
      return !post.data.draft;
    }
    return true;
  });

  publishedPosts.sort(
    (a: CollectionEntry<"posts">, b: CollectionEntry<"posts">) => {
      return (
        new Date(b.data.publishedDate).getTime() -
        new Date(a.data.publishedDate).getTime()
      );
    },
  );

  return rss({
    title: siteData?.title || "José Manuel Requena Plens | Blog",
    description: siteData?.description || "Technical blog",
    site: context.site || "https://jmrp.io",
    items: await Promise.all(
      publishedPosts.map(async (post: CollectionEntry<"posts">) => {
        const authorEmail = post.data.authorEmail || "mail@jmrp.io";
        const authorName = post.data.author || "José Manuel Requena Plens";
        const authorString = `${authorEmail} (${authorName})`;

        const postBody = post.body || "";
        
        // 1. Flatten components (Async now)
        const flattenedBody = await flattenComponents(postBody);

        // 2. Parse the outer Markdown
        // Since flattenedBody now contains HTML blocks (divs), marked will treat them as HTML blocks.
        // The INNER content has ALREADY been parsed to HTML by parseInnerMarkdown in flattenComponents.
        // So we should be good.
        const html = await marked.parse(flattenedBody);
        
        // 3. Sanitize
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

        // 4. Juice: Inline Styles
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
            const optimizedImage = await getImage({
              src: post.data.coverImage,
              format: "jpg",
              width: 1200,
            });
            const thumbnailImage = await getImage({
              src: post.data.coverImage,
              format: "jpg",
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

            // Prepend image to content
            const imageHtml = `<img src="${imageUrl}" alt="${post.data.title}" width="${optimizedImage.attributes.width}" height="${optimizedImage.attributes.height}" style="display: block; margin-bottom: 24px; border-radius: 8px; max-width: 100%; height: auto;" />`;
            finalContent = `${imageHtml}${styledHtml}`;

            enclosure = {
                url: imageUrl,
                length: 65535,
                type: "image/jpeg"
            };

            customItemData += `<media:content url="${imageUrl}" medium="image" type="image/jpeg" width="${optimizedImage.attributes.width}" height="${optimizedImage.attributes.height}" isDefault="true" />\n`;
            customItemData += `<media:thumbnail url="${thumbUrl}" width="${thumbnailImage.attributes.width}" height="${thumbnailImage.attributes.height}" />`;
          } catch (e) {
            console.warn(`Failed to optimize RSS image for ${post.slug}`, e);
          }
        }

        const itemDescription = post.data.description || "";

        return {
          title: post.data.title,
          description: itemDescription,
          pubDate: new Date(post.data.publishedDate),
          link: `/blog/${post.slug}/`,
          categories: post.data.tags || [],
          author: authorString,
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
      media: "http://search.yahoo.com/mrss/", // NOSONAR
    },
  });
}