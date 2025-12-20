import fs from "node:fs";
import path from "node:path";
import { glob } from "glob";
import crypto from "node:crypto";

const DIST_DIR = process.env.DIST_DIR || "dist";
const ASSETS_DIR = "assets/extracted";
const TARGET_DIR = path.join(DIST_DIR, ASSETS_DIR);

// Capture generic img tags with src attribute
// We catch the whole tag to be able to replace the src attribute correctly within it
// Group 1: Attributes before src
// Group 2: Quote char (" or ')
// Group 3: The content of src
// Group 4: Attributes after src
const IMG_TAG_REGEX = /<img([^>]*)\bsrc=(["'])(.*?)\2([^>]*)>/gi; // NOSONAR javascript:S5852

async function extractHtmlImgDataUris() {
  console.log("Starting HTML Image Data URI extraction...");

  // Ensure target directory exists
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  // Scan HTML files
  const htmlFiles = await glob(`${DIST_DIR}/**/*.html`);
  let totalExtracted = 0;

  for (const file of htmlFiles) {
    let content = fs.readFileSync(file, "utf-8");
    let modified = false;

    content = content.replaceAll(
      IMG_TAG_REGEX,
      (fullMatch, preAttrs, quote, srcContent, postAttrs) => {
        // Check if it is a Data URI
        if (!srcContent.trim().startsWith("data:")) {
          return fullMatch;
        }

        try {
          // Parse Data URI manually
          // Format: data:[<mediatype>][;base64],<data>
          const commaIndex = srcContent.indexOf(",");
          if (commaIndex === -1) return fullMatch;

          const metadata = srcContent.substring(5, commaIndex); // remove 'data:'
          const rawData = srcContent.substring(commaIndex + 1);

          const isBase64 = metadata.endsWith(";base64");
          const mimeType = isBase64 ? metadata.slice(0, -7) : metadata;

          // Decode data
          let buffer;
          if (isBase64) {
            buffer = Buffer.from(rawData, "base64");
          } else {
            // URI encoded
            buffer = Buffer.from(decodeURIComponent(rawData.trim()));
          }

          // Determine extension
          let ext = "bin";
          if (mimeType.includes("svg")) ext = "svg";
          else if (mimeType.includes("png")) ext = "png";
          else if (mimeType.includes("jpeg") || mimeType.includes("jpg"))
            ext = "jpg";
          else if (mimeType.includes("gif")) ext = "gif";
          else if (mimeType.includes("webp")) ext = "webp";

          // Generate Hash for filename
          const hash = crypto
            .createHash("sha256")
            .update(buffer)
            .digest("hex")
            .substring(0, 16);
          const filename = `${hash}.${ext}`;
          const filePath = path.join(TARGET_DIR, filename);

          // Write file if it doesn't exist (deduplication)
          if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, buffer);
            totalExtracted++;
          }

          // Construct new URL
          const newUrl = `/${ASSETS_DIR}/${filename}`;
          modified = true;

          // Reconstruct the img tag
          return `<img${preAttrs} src=${quote}${newUrl}${quote}${postAttrs}>`;
        } catch (err) {
          console.warn(
            `Failed to process Image Data URI in ${file}: ${err.message}`,
          );
          return fullMatch; // Do not replace if error
        }
      },
    );

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
