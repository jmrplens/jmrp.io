import rss from "@astrojs/rss";
import { getCollection, getEntry } from "astro:content";
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
  langs: ["javascript", "typescript", "nginx", "bash", "yaml", "ini", "html", "css", "text", "json", "markdown"],
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
        console.warn(`[RSS] Shiki highlighting failed for ${language}:`, e);
        return `<pre><code>${text}</code></pre>`;
      }
    },
  },
});

if (typeof process !== "undefined" && typeof process.on === "function") {
  process.on("beforeExit", async () => {
    try {
      const r = mermaidRenderer as any;
      if (r && typeof r.close === "function") await r.close();
    } catch (e) {
      console.warn("[RSS] Mermaid renderer cleanup failed:", e);
    }
  });
}

function cleanContent(text: string): string {
  if (!text) return "";
  const lines = text.split("\n");
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
  if (nonEmptyLines.length === 0) return "";
  const indentRegex = /^\s*/; // NOSONAR
  const minIndent = Math.min(...nonEmptyLines.map((l) => indentRegex.exec(l)?.[0].length || 0)); // NOSONAR
  return lines.map((l) => l.slice(minIndent)).join("\n").trim();
}

async function renderBody(body: string): Promise<string> {
  const codeRegex = /```(\w+)?\n([\s\S]*?)```/; // NOSONAR
  const codeMatch = codeRegex.exec(body); // NOSONAR
  if (codeMatch) {
    try {
      const l = codeMatch[1] || "text";
      const c = codeMatch[2].trim();
      return highlighter.codeToHtml(c, { lang: l, theme: "github-light" });
    } catch (e) {
      console.warn("[RSS] Shiki block render failed:", e);
      return `<pre><code>${body}</code></pre>`;
    }
  }
  return await marked.parse(cleanContent(body));
}

async function processMermaid(content: string): Promise<string> {
  let res = content;
  const mermaidRegex = /```mermaid-render([\s\S]*?)```/g; // NOSONAR
  const mMatches = Array.from(res.matchAll(mermaidRegex)); // NOSONAR
  if (mMatches.length > 0) {
    const codes = mMatches.map((m) => m[1].trim());
    try {
      const resL = await mermaidRenderer(codes, { mermaidConfig: { theme: "neutral" } });
      const resD = await mermaidRenderer(codes, { mermaidConfig: { theme: "base", themeVariables: MERMAID_DARK_VARS } });
      for (let i = 0; i < mMatches.length; i++) {
        const l = resL[i];
        if (l?.status === "fulfilled") {
          const bL = Buffer.from(l.value.svg).toString("base64");
          const img = `<div style="margin:24px 0;text-align:center;"><img src="data:image/svg+xml;base64,${bL}" alt="Mermaid Diagram" width="${l.value.width}" height="${l.value.height}" style="max-width:100%;height:auto;display:block;margin:0 auto;" /></div>`;
          res = res.replace(mMatches[i][0], img); // NOSONAR
        }
      }
    } catch (e) {
      console.error("[RSS] Mermaid process error:", e);
      res = res.replaceAll(mermaidRegex, "<blockquote>[Diagram rendering failed]</blockquote>"); // NOSONAR
    }
  }
  return res;
}

async function processAsyncComponents(content: string): Promise<string> {
  let res = content;
  const fcMatches = Array.from(res.matchAll(/<FileContent\s+([^>]*?)>([\s\S]*?)<\/FileContent>/g)); // NOSONAR
  for (const m of fcMatches) {
    const fn = m[1].match(/filename=["']([^"']*)["']/)?.[1] || "File"; // NOSONAR
    res = res.replace(m[0], `<div style="border:1px solid #e1e4e8;margin:16px 0;overflow:hidden;"><div style="background:#f6f8fa;padding:8px 16px;border-bottom:1px solid #e1e4e8;font-family:monospace;font-size:12px;font-weight:bold;">📄 ${fn}</div><div style="padding:0;">${await renderBody(m[2])}</div></div>`); // NOSONAR
  }
  const toMatches = Array.from(res.matchAll(/<TerminalOutput\s+title=["']([^"']*)["'][^>]*>([\s\S]*?)<\/TerminalOutput>/g)); // NOSONAR
  for (const m of toMatches) {
    res = res.replace(m[0], `<div style="border:1px solid #e1e4e8;margin:16px 0;overflow:hidden;background:#fafafa;"><div style="padding:8px 16px;border-bottom:1px solid #e1e4e8;font-family:monospace;font-size:12px;color:#666;">> ${m[1]}</div><div style="padding:12px;font-family:monospace;font-size:13px;color:#555;">${await renderBody(m[2])}</div></div>`); // NOSONAR
  }
  res = res.replaceAll(/<Tabs[^>]*>([\s\S]*?)<\/Tabs>/g, "$1"); // NOSONAR
  const tpMatches = Array.from(res.matchAll(/<TabPanel\s+label=["']([^"']*)["'][^>]*>([\s\S]*?)<\/TabPanel>/g)); // NOSONAR
  for (const m of tpMatches) {
    res = res.replace(m[0], `<div style="margin:16px 0;border:1px solid #e1e4e8;"><div style="background:#f6f8fa;padding:4px 12px;border-bottom:1px solid #e1e4e8;font-size:12px;color:#666;">Tab: ${m[1]}</div><div style="padding:0;">${await renderBody(m[2])}</div></div>`); // NOSONAR
  }
  const ccMatches = Array.from(res.matchAll(/<CompareCode\s+([^>]*?)>([\s\S]*?)<\/CompareCode>/g)); // NOSONAR
  for (const m of ccMatches) {
    const bt = m[1].match(/badTitle=["']([^"']*)["']/)?.[1] || "Bad"; // NOSONAR
    const gt = m[1].match(/goodTitle=["']([^"']*)["']/)?.[1] || "Good"; // NOSONAR
    const bcM = m[2].match(/<[^>]*slot=["']?bad["']?[^>]*>([\s\S]*?)<\/[^>]*>/i); // NOSONAR
    const gcM = m[2].match(/<[^>]*slot=["']?good["']?[^>]*>([\s\S]*?)<\/[^>]*>/i); // NOSONAR
    res = res.replace(m[0], `<div style="margin:24px 0;"><div style="border:1px solid #ef4444;margin-bottom:12px;"><div style="background:#ef4444;color:white;padding:4px 12px;font-weight:bold;font-size:13px;">✕ ${bt}</div><div style="padding:0;">${bcM ? await renderBody(bcM[1]) : ""}</div></div><div style="border:1px solid #10b981;"><div style="background:#10b981;color:white;padding:4px 12px;font-weight:bold;font-size:13px;">✓ ${gt}</div><div style="padding:0;">${gcM ? await renderBody(gcM[1]) : ""}</div></div></div>`); // NOSONAR
  }
  return res;
}

async function flattenComponents(content: string): Promise<string> {
  let res = content;
  // 0. Cleanup
  res = res.replaceAll(/^import\s+[^;]*;?$/gm, "").replaceAll(/^export\s+[^;]*;?$/gm, "").replaceAll(/{\/\*[\s\S]*?\*\/}/g, ""); // NOSONAR
  // 1. Mermaid
  res = await processMermaid(res);
  // 2. Async Components
  res = await processAsyncComponents(res);
  // 3. TerminalCommand
  res = res.replaceAll(/<TerminalCommand\s+([^>]*?)\/?>((?:<\/TerminalCommand>)?)/g, (_m, a) => { // NOSONAR
    const c = a.match(/command=["']([^"']*)["']/)?.[1] || ""; // NOSONAR
    const p = a.match(/prompt=["']([^"']*)["']/)?.[1] || "$"; // NOSONAR
    return `<div style="background:#1a1b26;color:#a9b1d6;padding:12px;font-family:monospace;margin:16px 0;"><span style="color:#565f89;margin-right:8px;">${p}</span> ${c}</div>`;
  });
  // 4. Callout
  const coMatches = Array.from(res.matchAll(/<Callout\s+type=["']([^"']*)["'][^>]*>([\s\S]*?)<\/Callout>/g)); // NOSONAR
  for (const m of coMatches) {
    const colors: any = { info: "#3b82f6", warning: "#f59e0b", danger: "#ef4444", success: "#10b981" };
    res = res.replace(m[0], `<div style="padding:16px;margin:16px 0;border-left:4px solid ${colors[m[1]] || colors.info};background:#f8fafc;"><strong style="color:${colors[m[1]] || colors.info};font-size:12px;display:block;margin-bottom:4px;">${m[1].toUpperCase()}</strong>${await marked.parse(cleanContent(m[2]))}</div>`); // NOSONAR
  }
  // 5. KeyPoint
  const kpMatches = Array.from(res.matchAll(/<KeyPoint[^>]*>([\s\S]*?)<\/KeyPoint>/g)); // NOSONAR
  for (const m of kpMatches) {
    const body = await marked.parse(cleanContent(m[1]));
    res = res.replace(m[0], `<div style="padding:16px;margin:16px 0;border-left:4px solid #B509AC;background:#fff5ff;font-style:italic;"><strong style="color:#B509AC;font-size:12px;display:block;margin-bottom:4px;">KEY POINT</strong>${body}</div>`); // NOSONAR
  }
  // 6. YouTube
  res = res.replaceAll(/<YouTube\s+([^>]*?)\/?>/g, (_m, a) => { // NOSONAR
    const id = a.match(/id=["']([^"']*)["']/)?.[1] || ""; // NOSONAR
    const t = a.match(/title=["']([^"']*)["']/)?.[1] || "Video"; // NOSONAR
    return `<div style="margin:16px 0;text-align:center;border:1px solid #e1e4e8;padding:20px;background:#f9f9f9;"><p style="margin-bottom:10px;">📺 <strong>${t}</strong></p><a href="https://www.youtube.com/watch?v=${id}" style="color:#B509AC;text-decoration:underline;">Watch on YouTube</a></div>`;
  });
  return res;
}

export async function GET(context: APIContext) {
  const posts = await getCollection("posts");
  const siteEntry = await getEntry("site_config", "site");
  const siteData = siteEntry?.data;
  const publishedPosts = posts.filter((p) => (import.meta.env.PROD ? !p.data.draft : true));
  publishedPosts.sort((a, b) => new Date(b.data.publishedDate).getTime() - new Date(a.data.publishedDate).getTime());

  return rss({
    title: siteData?.title || "José Manuel Requena Plens | Blog",
    description: siteData?.description || "Technical blog",
    site: context.site || "https://jmrp.io",
    items: await Promise.all(
      publishedPosts.map(async (post) => {
        const author = `${post.data.authorEmail || "mail@jmrp.io"} (${post.data.author || "José Manuel Requena Plens"})`;
        const html = await marked.parse(
          await flattenComponents(post.body || ""),
        );
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

        const styledHtml = juice(cleanHtml, {
          extraCss: RSS_STYLES,
          applyStyleTags: false,
          removeStyleTags: true,
          preserveMediaQueries: true,
          preserveFontFaces: false,
          insertPreservedExtraCss: false,
        });

        let finalContent = styledHtml;
        let customData = "";
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

            // 1. Prepend image to content for readers that don't support enclosures
            finalContent = `<div style="margin-bottom: 24px;"><img src="${imgUrl}" alt="${post.data.title}" style="max-width:100%; height:auto; border-radius: 8px;" /></div>${styledHtml}`;

            // 2. Set official enclosure (Astro will add the <enclosure> tag)
            enclosure = {
              url: imgUrl,
              length: 0,
              type: "image/jpeg",
            };

            // 3. Add Media RSS tags for advanced readers
            customData += `<media:content url="${imgUrl}" medium="image" type="image/jpeg" width="${opt.attributes.width}" height="${opt.attributes.height}" />\n<media:thumbnail url="${thumbUrl}" width="${thumb.attributes.width}" height="${thumb.attributes.height}" />`;
          } catch (e) {
            console.warn("[RSS] Cover image process failed:", e);
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
          customData,
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