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

function cleanContent(text: string): string {
  if (!text) return "";
  const lines = text.split("\n");
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
  if (nonEmptyLines.length === 0) return "";
  const minIndent = Math.min(
    ...nonEmptyLines.map((l) => l.match(/^\s*/)?.[0].length || 0),
  ); // NOSONAR
  return lines
    .map((l) => l.slice(minIndent))
    .join("\n")
    .trim();
}

async function renderBody(body: string): Promise<string> {
  const codeMatch = body.match(/```(\w+)?\n([\s\S]*?)```/); // NOSONAR
  if (codeMatch) {
    try {
      const l = codeMatch[1] || "text";
      const c = codeMatch[2].trim();
      return highlighter.codeToHtml(c, { lang: l, theme: "github-light" });
    } catch (e) {
      return `<pre><code>${body}</code></pre>`;
    }
  }
  return await marked.parse(cleanContent(body));
}

async function flattenComponents(content: string): Promise<string> {
  let res = content;

  // Regex constants
  const rImp = /^import\s+[^;]*;?$/gm; // NOSONAR
  const rExp = /^export\s+[^;]*;?$/gm; // NOSONAR
  const rMdx = /{\/\*[\s\S]*?\*\/}/g; // NOSONAR
  const rMer = /```mermaid-render([\s\S]*?)```/g; // NOSONAR
  const rTmc = /<TerminalCommand\s+([^>]*?)\/?>((?:<\/TerminalCommand>)?)/g; // NOSONAR
  const rFct = /<FileContent\s+([^>]*?)>([\s\S]*?)<\/FileContent>/g; // NOSONAR
  const rTou =
    /<TerminalOutput\s+title=["']([^"']*)["'][^>]*>([\s\S]*?)<\/TerminalOutput>/g; // NOSONAR
  const rCal = /<Callout\s+type=["']([^"']*)["'][^>]*>([\s\S]*?)<\/Callout>/g; // NOSONAR
  const rCol =
    /<Collapsible\s+summary=["']([^"']*)["'][^>]*>([\s\S]*?)<\/Collapsible>/g; // NOSONAR
  const rTbs = /<Tabs[^>]*>([\s\S]*?)<\/Tabs>/g; // NOSONAR
  const rTpn =
    /<TabPanel\s+label=["']([^"']*)["'][^>]*>([\s\S]*?)<\/TabPanel>/g; // NOSONAR
  const rCpc = /<CompareCode\s+([^>]*?)>([\s\S]*?)<\/CompareCode>/g; // NOSONAR
  const rYtb = /<YouTube\s+([^>]*?)\/?>/g; // NOSONAR

  // 0. Cleanup
  res = res.replaceAll(rImp, "").replaceAll(rExp, "").replaceAll(rMdx, ""); // NOSONAR

  // 1. Mermaid (Async)
  const mMatches = Array.from(res.matchAll(rMer)); // NOSONAR
  if (mMatches.length > 0) {
    const codes = mMatches.map((m) => m[1].trim());
    const resL = await mermaidRenderer(codes, {
      mermaidConfig: { theme: "neutral" },
    });
    const resD = await mermaidRenderer(codes, {
      mermaidConfig: { theme: "base", themeVariables: MERMAID_DARK_VARS },
    });
    for (let i = 0; i < mMatches.length; i++) {
      const l = resL[i],
        d = resD[i];
      if (l?.status === "fulfilled" && d?.status === "fulfilled") {
        const bL = Buffer.from(l.value.svg).toString("base64"),
          bD = Buffer.from(d.value.svg).toString("base64");
        const img = `<div style="margin:24px 0;text-align:center;"><picture><source srcset="data:image/svg+xml;base64,${bD}" media="(prefers-color-scheme: dark)"><img src="data:image/svg+xml;base64,${bL}" alt="Mermaid Diagram" width="${l.value.width}" height="${l.value.height}" style="max-width:100%;height:auto;display:block;margin:0 auto;" /></picture></div>`;
        res = res.replace(mMatches[i][0], img); // NOSONAR
      }
    }
  }

  // 2. TerminalCommand
  res = res.replaceAll(rTmc, (_m, a) => {
    // NOSONAR
    const cmd = a.match(/command=["']([^"']*)["']/)?.[1] || ""; // NOSONAR
    const pmt = a.match(/prompt=["']([^"']*)["']/)?.[1] || "$"; // NOSONAR
    return `<div style="background:#1a1b26;color:#a9b1d6;padding:12px;font-family:monospace;margin:16px 0;"><span style="color:#565f89;margin-right:8px;">${pmt}</span> ${cmd}</div>`;
  });

  // 3. FileContent (Async)
  const fcMatches = Array.from(res.matchAll(rFct)); // NOSONAR
  for (const m of fcMatches) {
    const fn = m[1].match(/filename=["']([^"']*)["']/)?.[1] || "File"; // NOSONAR
    const body = await renderBody(m[2]);
    res = res.replace(
      m[0],
      `<div style="border:1px solid #e1e4e8;margin:16px 0;overflow:hidden;"><div style="background:#f6f8fa;padding:8px 16px;border-bottom:1px solid #e1e4e8;font-family:monospace;font-size:12px;font-weight:bold;">📄 ${fn}</div><div style="padding:0;">${body}</div></div>`,
    ); // NOSONAR
  }

  // 4. TerminalOutput
  const toMatches = Array.from(res.matchAll(rTou)); // NOSONAR
  for (const m of toMatches) {
    const body = await renderBody(m[2]);
    res = res.replace(
      m[0],
      `<div style="border:1px solid #e1e4e8;margin:16px 0;overflow:hidden;background:#fafafa;"><div style="padding:8px 16px;border-bottom:1px solid #e1e4e8;font-family:monospace;font-size:12px;color:#666;">> ${m[1]}</div><div style="padding:12px;font-family:monospace;font-size:13px;color:#555;">${body}</div></div>`,
    ); // NOSONAR
  }

  // 5. Callout
  const coMatches = Array.from(res.matchAll(rCal)); // NOSONAR
  for (const m of coMatches) {
    const colors: any = {
      info: "#3b82f6",
      warning: "#f59e0b",
      danger: "#ef4444",
      success: "#10b981",
    };
    const color = colors[m[1]] || colors.info;
    const body = await marked.parse(cleanContent(m[2]));
    res = res.replace(
      m[0],
      `<div style="padding:16px;margin:16px 0;border-left:4px solid ${color};background:#f8fafc;"><strong style="color:${color};text-transform:uppercase;font-size:12px;display:block;margin-bottom:4px;">${m[1]}</strong>${body}</div>`,
    ); // NOSONAR
  }

  // 6. Tabs & TabPanel
  res = res.replaceAll(rTbs, "$1"); // NOSONAR
  const tpMatches = Array.from(res.matchAll(rTpn)); // NOSONAR
  for (const m of tpMatches) {
    const body = await renderBody(m[2]);
    res = res.replace(
      m[0],
      `<div style="margin:16px 0;border:1px solid #e1e4e8;"><div style="background:#f6f8fa;padding:4px 12px;border-bottom:1px solid #e1e4e8;font-size:12px;color:#666;">Tab: ${m[1]}</div><div style="padding:0;">${body}</div></div>`,
    ); // NOSONAR
  }

  // 7. CompareCode
  const ccMatches = Array.from(res.matchAll(rCpc)); // NOSONAR
  for (const m of ccMatches) {
    const bt = m[1].match(/badTitle=["']([^"']*)["']/)?.[1] || "Bad"; // NOSONAR
    const gt = m[1].match(/goodTitle=["']([^"']*)["']/)?.[1] || "Good"; // NOSONAR
    const bcM = m[2].match(
      /<[^>]*slot=["']?bad["']?[^>]*>([\s\S]*?)<\/[^>]*>/i,
    ); // NOSONAR
    const gcM = m[2].match(
      /<[^>]*slot=["']?good["']?[^>]*>([\s\S]*?)<\/[^>]*>/i,
    ); // NOSONAR
    const bc = bcM ? await renderBody(bcM[1]) : "";
    const gc = gcM ? await renderBody(gcM[1]) : "";
    res = res.replace(
      m[0],
      `<div style="margin:24px 0;"><div style="border:1px solid #ef4444;margin-bottom:12px;"><div style="background:#ef4444;color:white;padding:4px 12px;font-weight:bold;font-size:13px;">✕ ${bt}</div><div style="padding:0;">${bc}</div></div><div style="border:1px solid #10b981;"><div style="background:#10b981;color:white;padding:4px 12px;font-weight:bold;font-size:13px;">✓ ${gt}</div><div style="padding:0;">${gc}</div></div></div>`,
    ); // NOSONAR
  }

  // 8. YouTube
  res = res.replaceAll(rYtb, (_m, a) => {
    // NOSONAR
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

        let customData = "";
        if (post.data.coverImage) {
          try {
            const opt = await getImage({
              src: post.data.coverImage,
              format: "webp",
              width: 1200,
            });
            const thumb = await getImage({
              src: post.data.coverImage,
              format: "webp",
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
            customData += `<enclosure url="${imgUrl}" length="0" type="image/webp" />\n<media:content url="${imgUrl}" medium="image" type="image/webp" width="${opt.attributes.width}" height="${opt.attributes.height}" />\n<media:thumbnail url="${thumbUrl}" width="${thumb.attributes.width}" height="${thumb.attributes.height}" />`;
          } catch (e) {}
        }

        return {
          title: post.data.title,
          description: post.data.description || "",
          pubDate: new Date(post.data.publishedDate),
          link: `/blog/${post.slug}/`,
          categories: post.data.tags || [],
          author,
          content: styledHtml,
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
