/**
 * HTML Image Data URI Extractor
 *
 * This script identifies <img> and <source> tags with embedded base64 Data URIs
 * in the 'src' or 'srcset' attributes and extracts them into physical files.
 *
 * Purpose:
 * - Reduces HTML document size significantly.
 * - Enables browser caching for extracted assets.
 * - Compatible with SRI and CSP security headers.
 */

import fs from "node:fs";
import path from "node:path";
import { glob } from "glob";
import crypto from "node:crypto";
import * as cheerio from "cheerio";

const DIST_DIR = process.argv[2] || process.env.DIST_DIR || "dist";
const ASSETS_DIR = "assets/extracted";
const TARGET_DIR = path.join(DIST_DIR, ASSETS_DIR);

async function extractHtmlImgDataUris() {
  console.log("Starting HTML Image Data URI extraction...");

  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  const htmlFiles = await glob(`${DIST_DIR}/**/*.html`);
  let totalExtracted = 0;

  for (const file of htmlFiles) {
    let content = fs.readFileSync(file, "utf-8");
    const $ = cheerio.load(content);
    let modified = false;

    $('img[src^="data:"], source[srcset^="data:"]').each((_, el) => {
      const $el = $(el);
      const tagName = el.tagName.toLowerCase();
      const attrName = tagName === "source" ? "srcset" : "src";
      const srcContent = $el.attr(attrName);

      if (!srcContent || !srcContent.trim().startsWith("data:")) return;

      try {
        const commaIndex = srcContent.indexOf(",");
        if (commaIndex === -1) return;

        const metadata = srcContent.substring(5, commaIndex);
        const rawData = srcContent.substring(commaIndex + 1);

        const isBase64 = metadata.endsWith(";base64");
        const mimeType = isBase64 ? metadata.slice(0, -7) : metadata;

        let buffer = isBase64
          ? Buffer.from(rawData, "base64")
          : Buffer.from(decodeURIComponent(rawData.trim()));

        let ext = "bin";
        if (mimeType.includes("svg")) ext = "svg";
        else if (mimeType.includes("png")) ext = "png";
        else if (mimeType.includes("jpeg") || mimeType.includes("jpg"))
          ext = "jpg";
        else if (mimeType.includes("gif")) ext = "gif";
        else if (mimeType.includes("webp")) ext = "webp";

        const hash = crypto
          .createHash("sha256")
          .update(buffer)
          .digest("hex")
          .substring(0, 16);
        const filename = `${hash}.${ext}`;
        const filePath = path.join(TARGET_DIR, filename);

        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, buffer);
          totalExtracted++;
        }

        const newUrl = `/${ASSETS_DIR}/${filename}`;
        $el.attr(attrName, newUrl);
        modified = true;
      } catch (err) {
        console.warn(`Failed to process Data URI in ${file}: ${err.message}`);
      }
    });

    if (modified) {
      fs.writeFileSync(file, $.html(), "utf-8");
      console.log(`Updated ${file}`);
    }
  }

  console.log(
    `HTML Image Extraction complete. Extracted ${totalExtracted} unique assets.`,
  );
}

await extractHtmlImgDataUris();
