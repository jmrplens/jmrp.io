import rss from "@astrojs/rss";
import { getCollection, getEntry, type CollectionEntry } from "astro:content";
import { getImage } from "astro:assets";
import type { APIContext } from "astro";
import sanitizeHtml from "sanitize-html";
import { Marked } from "marked";
import juice from "juice";
import fs from "node:fs";
import path from "node:path";
import { createMermaidRenderer } from "mermaid-isomorphic";
import { createHighlighter } from "shiki";

const RSS_STYLES = fs.readFileSync(path.resolve("src/styles/rss.css"), "utf-8");

const MERMAID_DARK_VARS = {
  primaryColor: "#1f2937",
  primaryTextColor: "#f3f4f6",
  primaryBorderColor: "#4b5563",
  lineColor: "#f3f4f6",
  secondaryColor: "#374151",
  tertiaryColor: "#111827",
  mainBkg: "#1f2937",
  nodeBkg: "#111827",
  nodeBorder: "#4b5563",
  clusterBkg: "#111827",
  titleColor: "#f3f4f6",
  edgeLabelBackground: "#374151",
  defaultLinkColor: "#f3f4f6",
  actorBkg: "#111827",
  actorBorder: "#4b5563",
  actorTextColor: "#f3f4f6",
  actorLineColor: "#f3f4f6",
  signalColor: "#f3f4f6",
  signalTextColor: "#f3f4f6",
  labelBoxBkgColor: "#111827",
  labelBoxBorderColor: "#4b5563",
  labelTextColor: "#f3f4f6",
  loopTextColor: "#f3f4f6",
  noteBkgColor: "#374151",
  noteTextColor: "#f3f4f6",
  noteBorderColor: "#4b5563",
  messageTextColor: "#f3f4f6",
  messageLineColor: "#f3f4f6",
  sequenceNumberColor: "#111827",
};

const mermaidRenderer = createMermaidRenderer({
  launchOptions: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
});

const highlighter = await createHighlighter({
  themes: ["github-light"],
  langs: [
    "javascript",
    "typescript",
    "nginx",
    "bash",
    "yaml",
    "ini",
    "html",
    "css",
    "text",
    "json",
    "markdown",
  ],
});

const marked = new Marked({
  async: true,
  renderer: {
    code({ text, lang }) {
      const language = lang || "text";
      try {
        return highlighter.codeToHtml(text, {
          lang: language,
          theme: "github-light",
        });
      } catch (e) {
        return `<pre><code>${text}</code></pre>`;
      }
    },
  },
});

if (typeof process !== "undefined" && typeof process.on === "function") {
  process.on("beforeExit", async () => {
    const r = mermaidRenderer as any;
    if (r && typeof r.close === "function") await r.close();
  });
}

async function flattenComponents(content: string): Promise<string> {
  let flattened = content;

  // 0. Cleanup
  flattened = flattened.replaceAll(/^import\s+[^;]*;?$/gm, ""); // NOSONAR
  flattened = flattened.replaceAll(/^export\s+[^;]*;?$/gm, ""); // NOSONAR
  flattened = flattened.replaceAll(/{\/\*[\s\S]*?\*\/}/g, ""); // NOSONAR

  // 1. TerminalCommand
  flattened = flattened.replaceAll(
    /<TerminalCommand\s+([^>]*)\inaly/g,
    (match, attrs) => {
      // NOSONAR
      const command = attrs.match(/command=[\"']([^\"']*)[\"']/)?.[1] || ""; // NOSONAR
      const prompt = attrs.match(/prompt=[\"']([^\"']*)[\"']/)?.[1] || "$"; // NOSONAR
      return `<div style=\"background:#1a1b26;color:#a9b1d6;padding:12px;font-family:monospace;margin:16px 0;\"><span style=\"color:#565f89;margin-right:8px;\">${prompt}</span> ${command}</div>`;
    },
  );

  // 2. FileContent
  flattened = flattened.replaceAll(
    /<FileContent\s+([^>]*?)>([\s\S]*?)<\/FileContent>/g,
    (match, attrs, body) => {
      // NOSONAR
      const filename =
        attrs.match(/filename=[\"']([^\"']*)[\"']/)?.[1] || "File"; // NOSONAR
      return `<div style=\"border:1px solid #e1e4e8;margin:16px 0;overflow:hidden;\"><div style=\"background:#f6f8fa;padding:8px 16px;border-bottom:1px solid #e1e4e8;font-family:monospace;font-size:12px;font-weight:bold;\">📄 ${filename}</div><div style=\"padding:0;\">\n\n${body}\n\n</div></div>`;
    },
  );

  // 3. TerminalOutput
  flattened = flattened.replaceAll(
    /<TerminalOutput\s+title=[\"']([^\"']*)[\"'][^>]*>([\s\S]*?)<\/TerminalOutput>/g,
    (match, title, body) => {
      // NOSONAR
      return `<div style=\"border:1px solid #e1e4e8;margin:16px 0;overflow:hidden;background:#fafafa;\"><div style=\"padding:8px 16px;border-bottom:1px solid #e1e4e8;font-family:monospace;font-size:12px;color:#666;\">> ${title}</div><div style=\"padding:12px;font-family:monospace;font-size:13px;color:#555;\">\n\n${body}\n\n</div></div>`;
    },
  );

  // 4. Callout
  flattened = flattened.replaceAll(
    /<Callout\s+type=[\"']([^\"']*)[\"'][^>]*>([\s\S]*?)<\/Callout>/g,
    (match, type, body) => {
      // NOSONAR
      const colors: any = {
        info: "#3b82f6",
        warning: "#f59e0b",
        danger: "#ef4444",
        success: "#10b981",
      };
      const color = colors[type] || colors.info;
      return `<div style=\"padding:16px;margin:16px 0;border-left:4px solid ${color};background:#f8fafc;\"><strong style=\"color:${color};text-transform:uppercase;font-size:12px;display:block;margin-bottom:4px;\">${type}</strong>\n\n${body}\n\n</div>`;
    },
  );

  // 5. Collapsible
  flattened = flattened.replaceAll(
    /<Collapsible\s+summary=[\"']([^\"']*)[\"'][^>]*>([\s\S]*?)<\/Collapsible>/g,
    (match, summary, body) => {
      // NOSONAR
      return `<details style=\"border:1px solid #e1e4e8;margin:16px 0;\"><summary style=\"padding:12px;cursor:pointer;font-weight:bold;background:#f6f8fa;\">${summary}</summary><div style=\"padding:12px;\">\n\n${body}\n\n</div></details>`;
    },
  );

  // 6. Tabs
  flattened = flattened.replaceAll(/<Tabs[^>]*>([\s\S]*?)<\/Tabs>/g, "$1"); // NOSONAR
  flattened = flattened
    .replaceAll(/<TabPanel\s+label=[\"']([^\"']*)[\"']/g, (m, label) => {
      // NOSONAR
      return `<div style=\"background:#f6f8fa;padding:4px 12px;border-bottom:1px solid #e1e4e8;font-size:12px;color:#666;\">Tab: ${label}</div>`;
    })
    .replaceAll(/<\/TabPanel>/g, ""); // NOSONAR

  // 7. CompareCode
  flattened = flattened.replaceAll(
    /<CompareCode\s+([^>]*?)>([\s\S]*?)<\/CompareCode>/g,
    (match, attrs, body) => {
      // NOSONAR
      const bt = attrs.match(/badTitle=[\"']([^\"']*)[\"']/)?.[1] || "Bad"; // NOSONAR
      const gt = attrs.match(/goodTitle=[\"']([^\"']*)[\"']/)?.[1] || "Good"; // NOSONAR
      const bc =
        body.match(/<[^>]*slot=[\"']bad[\"'][^>]*>([\s\S]*?)<\/[^>]*>/)?.[1] ||
        ""; // NOSONAR
      const gc =
        body.match(/<[^>]*slot=[\"']good[\"'][^>]*>([\s\S]*?)<\/[^>]*>/)?.[1] ||
        ""; // NOSONAR
      return `<div style=\"margin:24px 0;\"><div style=\"border:1px solid #ef4444;margin-bottom:12px;\"><div style=\"background:#ef4444;color:white;padding:4px 12px;font-weight:bold;font-size:13px;\">✕ ${bt}</div><div style=\"padding:0;\">\n\n${bc}\n\n</div></div><div style=\"border:1px solid #10b981;\"><div style=\"background:#10b981;color:white;padding:4px 12px;font-weight:bold;font-size:13px;\">✓ ${gt}</div><div style=\"padding:0;\">\n\n${gc}\n\n</div></div></div>`;
    },
  );

  // 8. YouTube
  flattened = flattened.replaceAll(
    /<YouTube\s+([^>]*)\inaly/g,
    (match, attrs) => {
      // NOSONAR
      const id = attrs.match(/id=[\"']([^\"']*)[\"']/)?.[1] || ""; // NOSONAR
      const title = attrs.match(/title=[\"']([^\"']*)[\"']/)?.[1] || "Video"; // NOSONAR
      return `<div style=\"margin:16px 0;text-align:center;border:1px solid #e1e4e8;padding:20px;background:#f9f9f9;\"><p style=\"margin-bottom:10px;\">📺 <strong>${title}</strong></p><a href=\"https://www.youtube.com/watch?v=${id}\" style=\"color:#B509AC;text-decoration:underline;\">Watch on YouTube</a></div>`;
    },
  );

  // 9. Mermaid Render
  const mermaidRegex = /```mermaid-render([\s\S]*?)```/g; // NOSONAR
  const mermaidMatches = Array.from(flattened.matchAll(mermaidRegex)); // NOSONAR
  if (mermaidMatches.length > 0) {
    const codes = mermaidMatches.map((m) => m[1].trim());
    try {
      const resL = await mermaidRenderer(codes, {
        mermaidConfig: { theme: "neutral" },
      });
      const resD = await mermaidRenderer(codes, {
        mermaidConfig: { theme: "base", themeVariables: MERMAID_DARK_VARS },
      });
      let mi = 0;
      flattened = flattened.replaceAll(mermaidRegex, () => {
        // NOSONAR
        const i = mi++;
        const l = resL[i];
        const d = resD[i];
        if (l?.status === "fulfilled" && d?.status === "fulfilled") {
          const bL = Buffer.from(l.value.svg).toString("base64");
          const bD = Buffer.from(d.value.svg).toString("base64");
          return `<div style=\"margin:24px 0;text-align:center;\"><picture><source srcset=\"data:image/svg+xml;base64,${bD}\" media=\"(prefers-color-scheme: dark)\"><img src=\"data:image/svg+xml;base64,${bL}\" alt=\"Mermaid Diagram\" width=\"${l.value.width}\" height=\"${l.value.height}\" style=\"max-width:100%;height:auto;display:block;margin:0 auto;\" /></picture></div>`;
        }
        return "<blockquote>[Diagram rendering failed]</blockquote>";
      });
    } catch (e) {
      flattened = flattened.replaceAll(
        mermaidRegex,
        "<blockquote>[Diagram rendering failed]</blockquote>",
      ); // NOSONAR
    }
  }

  return flattened;
}

export async function GET(context: APIContext) {
  const posts = await getCollection("posts");
  const siteEntry = await getEntry("site_config", "site");
  const siteData = siteEntry?.data;

  const publishedPosts = posts.filter((post: CollectionEntry<"posts">) => {
    if (import.meta.env.PROD) return !post.data.draft;
    return true;
  });

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
        const authorString = `${post.data.authorEmail || "mail@jmrp.io"} (${post.data.author || "José Manuel Requena Plens"})`;
        const flattenedBody = await flattenComponents(post.body || "");
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
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "ul",
            "ol",
            "li",
            "a",
            "table",
            "thead",
            "tbody",
            "tr",
            "th",
            "td",
            "hr",
            "br",
            "b",
            "i",
            "em",
            "u",
            "picture",
            "source",
          ]),
          allowedAttributes: {
            ...sanitizeHtml.defaults.allowedAttributes,
            img: ["src", "alt", "title", "width", "height", "style"],
            source: ["srcset", "media", "type"],
            a: ["href", "name", "target", "title", "rel"],
            code: ["class", "style"],
            span: ["class", "style"],
            div: ["style"],
            p: ["style"],
            details: ["style", "open"],
            summary: ["style"],
            strong: ["style"],
            pre: ["style", "class"],
            table: ["style"],
            th: ["style"],
            td: ["style"],
            li: ["style"],
            ul: ["style"],
            ol: ["style"],
            h1: ["style"],
            h2: ["style"],
            h3: ["style"],
            h4: ["style"],
            h5: ["style"],
            h6: ["style"],
            blockquote: ["style"],
          },
          allowedSchemesByTag: {
            img: ["http", "https", "data"],
            source: ["data"],
          },
        });

        const styledHtml = juice(sanitizedHtml, {
          extraCss: RSS_STYLES,
          applyStyleTags: false,
          removeStyleTags: true,
          preserveMediaQueries: true,
          preserveFontFaces: false,
          insertPreservedExtraCss: false,
        });

        let customItemData = "";
        if (post.data.coverImage) {
          try {
            const optImg = await getImage({
              src: post.data.coverImage,
              format: "webp",
              width: 1200,
            });
            const thumbImg = await getImage({
              src: post.data.coverImage,
              format: "webp",
              width: 400,
            });
            const imgUrl = new URL(
              optImg.src,
              context.site || "https://jmrp.io",
            ).toString();
            const thumbUrl = new URL(
              thumbImg.src,
              context.site || "https://jmrp.io",
            ).toString();
            customItemData += `<enclosure url="${imgUrl}" length="0" type="image/webp" />\n`;
            customItemData += `<media:content url="${imgUrl}" medium="image" type="image/webp" width="${optImg.attributes.width}" height="${optImg.attributes.height}" />\n`;
            customItemData += `<media:thumbnail url="${thumbUrl}" width="${thumbImg.attributes.width}" height="${thumbImg.attributes.height}" />`;
          } catch (e) {}
        }

        return {
          title: post.data.title,
          description: post.data.description || "",
          pubDate: new Date(post.data.publishedDate),
          link: `/blog/${post.slug}/`,
          categories: post.data.tags || [],
          author: authorString,
          content: styledHtml,
          customData: customItemData,
        };
      }),
    ),
    customData: `<language>${siteData?.locale?.replaceAll("_", "-").toLowerCase() || "en-us"}</language><lastBuildDate>${new Date().toUTCString()}</lastBuildDate><generator>Astro RSS Generator</generator><atom:link href="${new URL("rss.xml", context.site || "https://jmrp.io").toString()}" rel="self" type="application/rss+xml" />`,
    xmlns: {
      atom: "http://www.w3.org/2005/Atom",
      content: "http://purl.org/rss/1.0/modules/content/",
      media: "http://search.yahoo.com/mrss/", // NOSONAR
    },
  });
}
