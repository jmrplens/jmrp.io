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

const DIST_DIR = process.argv[2] || process.env.DIST_DIR || "dist";
const ASSETS_DIR = "assets/extracted";
const TARGET_DIR = path.join(DIST_DIR, ASSETS_DIR);

const IMG_TAG_REGEX = /<img([^>]*)\bsrc=(["'])(.*?)\2([^>]*)>/gi; // NOSONAR javascript:S5852
const SOURCE_TAG_REGEX = /<source([^>]*)\bsrcset=(["'])(.*?)\2([^>]*)>/gi; // NOSONAR javascript:S5852

async function extractHtmlImgDataUris() {
  console.log("Starting HTML Image Data URI extraction...");

  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  const htmlFiles = await glob(`${DIST_DIR}/**/*.html`);
  let totalExtracted = 0;

  for (const file of htmlFiles) {
    let content = fs.readFileSync(file, "utf-8");
    let modified = false;

    const replacer = (fullMatch, preAttrs, quote, srcContent, postAttrs) => {
      if (!srcContent.trim().startsWith("data:")) return fullMatch;

      try {
        const commaIndex = srcContent.indexOf(",");
        if (commaIndex === -1) return fullMatch;

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
        modified = true;

        let tagName = fullMatch.toLowerCase().startsWith("<source")
          ? "source"
          : "img";
        let attrName = tagName === "source" ? "srcset" : "src";

        return `<${tagName}${preAttrs} ${attrName}=${quote}${newUrl}${quote}${postAttrs}>`;
      } catch (err) {
        console.warn(`Failed to process Data URI in ${file}: ${err.message}`);
        return fullMatch;
      }
    };

    content = content.replaceAll(IMG_TAG_REGEX, replacer);
    content = content.replaceAll(SOURCE_TAG_REGEX, replacer);

    if (modified) {
      fs.writeFileSync(file, content, "utf-8");
      console.log(`Updated ${file}`);
    }
  }

  console.log(
    `HTML Image Extraction complete. Extracted ${totalExtracted} unique assets.`,
  );
}

await extractHtmlImgDataUris();
