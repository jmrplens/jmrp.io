/**
 * RSS Feed Preview Generator
 *
 * This script parses the generated RSS XML file and creates a clean HTML preview.
 * It's useful for verifying how the blog content will look in RSS readers,
 * especially regarding inline styles, images, and Mermaid diagrams.
 *
 * Usage: node scripts/preview-rss.mjs (requires dist/rss.xml to exist)
 */

import Parser from "rss-parser";
import fs from "node:fs";
import path from "node:path";
import { escapeHtml } from "./utils/html.mjs";

const RSS_FILE = "dist/rss.xml";
const OUTPUT_FILE = "dist/rss-preview.html";

async function generatePreview() {
  if (!fs.existsSync(RSS_FILE)) {
    console.error(`Error: File ${RSS_FILE} not found. Run 'pnpm build' first.`);
    process.exit(1);
  }

  const parser = new Parser({
    customFields: {
      item: ["content:encoded", "media:content", "media:thumbnail"],
    },
  });

  const xml = fs.readFileSync(RSS_FILE, "utf-8");
  const feed = await parser.parseString(xml);

  const htmlContent = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RSS Feed Preview</title>
    <link href="https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;1,300&family=Inter:wght@400;600&display=swap" rel="stylesheet">
    <style>
      :root {
        --bg: #f7f7f7;
        --card-bg: #ffffff;
        --text: #333333;
        --muted: #666666;
        --link: #0066cc;
        --border: #e0e0e0;
      }
      body {
        background-color: var(--bg);
        font-family: 'Merriweather', serif;
        margin: 0;
        padding: 40px 20px;
        color: var(--text);
        line-height: 1.6;
      }
      .container {
        max-width: 720px;
        margin: 0 auto;
      }
      .header-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
      }
      .btn {
          background: #333;
          color: white;
          padding: 8px 16px;
          text-decoration: none;
          border-radius: 4px;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
      }
      .feed-header {
        background: var(--card-bg);
        padding: 40px;
        border-radius: 8px;
        margin-bottom: 40px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        border: 1px solid var(--border);
        text-align: center;
      }
      .feed-header h1 { 
          font-family: 'Inter', sans-serif;
          margin: 0 0 10px 0; 
          font-weight: 700;
      }
      .feed-meta {
          font-family: 'Inter', sans-serif;
          color: var(--muted);
          font-size: 0.9rem;
      }
      
      .rss-item {
        background: var(--card-bg);
        padding: 40px;
        border-radius: 8px;
        margin-bottom: 40px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        border: 1px solid var(--border);
      }
      .item-header {
        border-bottom: 1px solid #f0f0f0;
        padding-bottom: 20px;
        margin-bottom: 20px;
      }
      .item-title {
        font-family: 'Inter', sans-serif;
        margin: 0 0 10px 0;
        font-size: 1.8rem;
        line-height: 1.3;
      }
      .item-title a {
          color: #111;
          text-decoration: none;
      }
      .item-title a:hover {
          color: var(--link);
      }
      .item-meta {
        font-family: 'Inter', sans-serif;
        color: var(--muted);
        font-size: 0.85rem;
      }

      /* Content Styling similar to Readers (Feedly/Reeder) */
      .content-body {
        font-size: 1.125rem;
        color: #2c2c2c;
      }
      .content-body a { color: var(--link); text-decoration: underline; }
      .content-body img { max-width: 100%; height: auto; display: block; margin: 20px auto; border-radius: 4px; }
      .content-body pre { 
          background: #f5f7f9; 
          padding: 15px; 
          border-radius: 4px; 
          overflow-x: auto; 
          font-family: 'Menlo', 'Monaco', monospace; 
          font-size: 0.9rem;
          border: 1px solid #e1e4e8;
      }
      .content-body blockquote {
          border-left: 4px solid var(--link);
          margin: 20px 0;
          padding-left: 20px;
          color: var(--muted);
          font-style: italic;
      }
      .content-body code {
          background: #f0f0f0;
          padding: 2px 4px;
          border-radius: 3px;
          font-size: 0.9em;
      }
      
      .enclosure {
          margin-bottom: 20px;
      }
      .enclosure img {
          width: 100%;
          border-radius: 8px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header-actions">
          <a href="https://validator.w3.org/feed/check.cgi?url=https://jmrp.io/rss.xml" class="btn" target="_blank">Validate Feed</a>
          <a href="/rss.xml" class="btn" target="_blank">View Raw XML</a>
      </div>
      
      <div class="feed-header">
        <h1>${escapeHtml(feed.title)}</h1>
        <p>${escapeHtml(feed.description)}</p>
        <div class="feed-meta">
            Generated: ${new Date().toUTCString()} • ${feed.items.length} Items
        </div>
      </div>

            ${feed.items

              .map((item) => {

                const content = item["content:encoded"] || item.content;

                const enclosure = item.enclosure || (item["media:content"] ? item["media:content"].$ : null);

                

                let enclosureHtml = "";

                // If the content already starts with an image (our new structure), we don't need to show enclosure separately 

                // but for the preview let's keep it consistent.

                if (enclosure && enclosure.url && enclosure.type && enclosure.type.startsWith("image") && !content.includes(enclosure.url)) {

                    enclosureHtml = `<div class="enclosure"><img src="${enclosure.url}" alt="Cover Image"></div>`;

                }

      

                return `

              <article class="rss-item">
          ${enclosureHtml}
          <div class="item-header">
            <h2 class="item-title"><a href="${escapeHtml(item.link)}" target="_blank">${escapeHtml(item.title)}</a></h2>
            <div class="item-meta">
              <time>${escapeHtml(item.pubDate)}</time>
               • ${escapeHtml(item.creator || "Unknown Author")}
            </div>
          </div>
          <div class="content-body">
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

generatePreview().catch((err) => console.error(err));
