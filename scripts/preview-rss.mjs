import Parser from "rss-parser";
import fs from "node:fs";
import path from "node:path";

const RSS_FILE = "dist/rss.xml";
const OUTPUT_FILE = "dist/rss-preview.html";

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

  const escapeHtml = (unsafe) => {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  let htmlContent = `
  <!DOCTYPE html>
  <!-- [html-validate-disable-block no-inline-style] -->
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RSS Feed Preview</title>
    <style>
      body {
        background-color: #f0f0f0;
        font-family: system-ui, -apple-system, sans-serif;
        margin: 0;
        padding: 20px;
      }
      .container {
        max-width: 800px;
        margin: 0 auto;
      }
      .feed-header {
        background: white;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 20px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      .rss-item {
        background: white;
        padding: 40px; /* Generous padding like a reader */
        border-radius: 8px;
        margin-bottom: 40px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        overflow: hidden; /* Simulate reader constraints */
      }
      .meta {
        color: #666;
        font-size: 0.9em;
        margin-bottom: 20px;
        border-bottom: 1px solid #eee;
        padding-bottom: 10px;
      }
      /* Reset generic styles to ensure we only see inline styles */
      .content-preview {
        all: initial; 
        font-family: inherit;
        display: block;
      }
      /* But allowed inherited properties like a reader would */
      .content-preview {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.6;
        color: #333;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="feed-header">
        <h1>RSS Preview: ${escapeHtml(feed.title)}</h1>
        <p>${escapeHtml(feed.description)}</p>
        <p><small>Generated from local dist/rss.xml</small></p>
      </div>

      ${feed.items
        .map((item) => {
          const content = item["content:encoded"] || item.content;
          return `
        <article class="rss-item">
          <div class="meta">
            <h2>${escapeHtml(item.title)}</h2>
            <time>${escapeHtml(item.pubDate)}</time> | <a href="${item.link}" target="_blank">Original Link</a>
          </div>
          <!-- The content below relies heavily on the inline styles we generated -->
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
  console.log(`👉 Open this file in your browser to verify inline styles.`);
}

generatePreview().catch((err) => console.error(err));
