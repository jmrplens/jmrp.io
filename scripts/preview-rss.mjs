/**
 * RSS Feed Preview Generator
 *
 * This script parses the generated RSS XML file and creates a clean HTML preview.
 * It's useful for verifying how the blog content will look in RSS readers,
 * especially regarding inline styles, images, and Mermaid diagrams.
 *
 * Usage: node scripts/preview-rss.mjs (requires dist/rss.xml to exist)
 */

import fs from "node:fs";
import path from "node:path";

import Parser from "rss-parser";

import { escapeHtml } from "./utils/html.mjs";

const RSS_FILE = "dist/rss.xml";
const OUTPUT_FILE = "dist/rss-preview.html";
const DIST_DIR = "dist";

/**
 * Converts an image URL to a base64 data URI.
 * Reads the image from the local dist folder.
 *
 * @param {string} imageUrl - The image URL to convert
 * @returns {string} The base64 data URI or original URL if conversion fails
 */
function embedImage(imageUrl) {
  try {
    // Support absolute URLs and root-relative paths
    const pathname = imageUrl.startsWith("/")
      ? imageUrl
      : new URL(imageUrl).pathname;

    // Normalize and prevent traversal out of DIST_DIR
    // Remove leading slashes/dots to make it a clean relative path
    const safeRel = path
      .normalize(pathname)
      .replace(/^(\.\.[/\\])+/, "")
      .replace(/^[/\\]+/, "");
    const localPath = path.resolve(DIST_DIR, safeRel);

    // Ensure we are still inside the dist directory
    const distPath = path.resolve(DIST_DIR);
    if (!localPath.startsWith(distPath + path.sep) && localPath !== distPath) {
      return imageUrl;
    }

    if (fs.existsSync(localPath)) {
      const imageBuffer = fs.readFileSync(localPath);
      const base64 = imageBuffer.toString("base64");
      const ext = path.extname(localPath).toLowerCase().slice(1);
      const mimeTypes = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
        avif: "image/avif",
      };
      const mimeType = mimeTypes[ext] || "image/jpeg";
      return `data:${mimeType};base64,${base64}`;
    }
  } catch (error) {
    // URL parsing failed or other error, return original
    console.warn(`Failed to embed image ${imageUrl}:`, error.message);
  }
  return imageUrl;
}

/**
 * Generates an HTML preview from the RSS XML file.
 *
 * @returns {Promise<void>} Resolves when the preview is generated.
 */
async function generatePreview() {
  if (!fs.existsSync(RSS_FILE)) {
    console.error(`Error: File ${RSS_FILE} not found. Run 'pnpm build' first.`);
    process.exit(1);
  }

  const parser = new Parser({
    customFields: {
      item: ["content:encoded"],
    },
  });

  const xml = fs.readFileSync(RSS_FILE, "utf-8");
  const feed = await parser.parseString(xml);

  const htmlContent = `
  <!DOCTYPE html>
  <!-- [html-validate-disable-block no-inline-style, attribute-allowed-values -- RSS content relies on these] -->
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RSS Feed Preview</title>
    <style>
      :root {
        --bg: #f3f4f6;
        --card: #ffffff;
        --text: #1f2937;
        --muted: #6b7280;
        --accent: #4f46e5;
      }
      body {
        background-color: var(--bg);
        font-family: Inter, system-ui, -apple-system, sans-serif;
        margin: 0;
        padding: 40px 20px;
        color: var(--text);
      }
      .container {
        max-width: 800px;
        margin: 0 auto;
      }
      .feed-header {
        background: var(--card);
        padding: 30px;
        border-radius: 12px;
        margin-bottom: 30px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        border: 1px solid #e5e7eb;
      }
      h1 { margin: 0 0 10px 0; font-size: 1.5rem; }
      .feed-description { color: var(--muted); margin-bottom: 0; }
      
      .rss-item {
        background: var(--card);
        padding: 40px;
        border-radius: 12px;
        margin-bottom: 40px;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        border: 1px solid #e5e7eb;
      }
      .meta {
        color: var(--muted);
        font-size: 0.875rem;
        margin-bottom: 24px;
        border-bottom: 1px solid #f3f4f6;
        padding-bottom: 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .meta h2 { margin: 0; color: var(--text); font-size: 1.25rem; flex: 1; }
      .meta-info { display: flex; gap: 12px; align-items: center; }
      .meta a { color: var(--accent); text-decoration: none; font-weight: 500; }
      .meta a:hover { text-decoration: underline; }

      .content-preview {
        line-height: 1.7;
        color: #374151;
      }
      .content-preview h1, .content-preview h2, .content-preview h3 { color: #111827; }
      .content-preview img { max-width: 100%; height: auto; border-radius: 8px; }
      .content-preview pre { background: #f8fafc; padding: 16px; border-radius: 8px; overflow-x: auto; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="feed-header">
        <h1>RSS Preview: ${escapeHtml(feed.title)}</h1>
        <p class="feed-description">${escapeHtml(feed.description)}</p>
        <p><small>Generated from <code>dist/rss.xml</code> on ${new Date().toUTCString()}</small></p>
      </div>

      ${feed.items
        .map((item) => {
          const content =
            item["content:encoded"] || item.content || item.description || "";

          // Embed the enclosure image as base64
          let enclosure = "";
          if (item.enclosure?.url) {
            const embeddedUrl = embedImage(item.enclosure.url);
            enclosure = `<img src="${escapeHtml(embeddedUrl)}" alt="Cover Image" style="width:100%; max-height: 400px; object-fit: cover; border-radius: 8px; margin-bottom: 20px;">`;
          }

          return `
        <article class="rss-item">
          <div class="meta">
            <h2>${escapeHtml(item.title)}</h2>
            <div class="meta-info">
              <time>${escapeHtml(item.pubDate)}</time>
              <span>•</span>
              <a href="${escapeHtml(item.link)}" target="_blank">View Post</a>
            </div>
          </div>
          ${enclosure}
          <div class="content-preview">
            ${content}
          </div>
        </article>
        `;
        })
        .join("")}
    </div>
  </body>
  </html>
  `;

  fs.writeFileSync(OUTPUT_FILE, htmlContent);
  console.log(`✅ Preview generated at: ${path.resolve(OUTPUT_FILE)}`);
}

try {
  await generatePreview();
} catch (error) {
  console.error(error);
  process.exit(1);
}
