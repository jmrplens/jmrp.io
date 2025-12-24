import fs from "node:fs";
import path from "node:path";
import { glob } from "glob";
import crypto from "node:crypto";
import { optimize } from "svgo";

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
const SOURCE_TAG_REGEX = /<source([^>]*)\bsrcset=(["'])(.*?)\2([^>]*)>/gi; // NOSONAR javascript:S5852

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

    const replacer = (fullMatch, preAttrs, quote, srcContent, postAttrs) => {
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
          if (ext === "svg") {
            try {
              let svgString = buffer.toString("utf-8");

              // HEURISTIC: Fix truncated Mermaid diagrams
              // Match generic M x y v len pattern (Move followed by Vertical Line)
              const actorLineRegex = /M[\d\.]+[ ,]([\d\.]+)\s*v\s*([\d\.]+)/g;
              let maxContentY = 0;
              let match;
              actorLineRegex.lastIndex = 0;

              while ((match = actorLineRegex.exec(svgString)) !== null) {
                const startY = parseFloat(match[1]);
                const length = parseFloat(match[2]);
                if (!isNaN(startY) && !isNaN(length)) {
                  maxContentY = Math.max(maxContentY, startY + length);
                }
              }

              // Match <line ... y2="..."> patterns (used by newer Mermaid/Playwright output)
              const lineRegex = /y2=["']([\d\.]+)["']/g;
              while ((match = lineRegex.exec(svgString)) !== null) {
                const y2 = parseFloat(match[1]);
                if (!isNaN(y2)) {
                  maxContentY = Math.max(maxContentY, y2);
                }
              }

              if (maxContentY > 0) {
                const viewBoxRegex = /viewBox=["']([^"']+)["']/;
                const vbMatch = svgString.match(viewBoxRegex);
                if (vbMatch) {
                  const parts = vbMatch[1]
                    .trim()
                    .split(/[\s,]+/)
                    .map(parseFloat);
                  if (parts.length === 4) {
                    const [minX, minY, width, height] = parts;
                    const requiredHeight = maxContentY + 50;

                    if (requiredHeight > height + 20) {
                      console.log(
                        `[FixViewBox] Detected truncation in ${filename}. Fixing ViewBox: old height=${height}, new height=${requiredHeight}`,
                      );
                      const newViewBox = `${minX} ${minY} ${width} ${requiredHeight}`;
                      svgString = svgString.replace(
                        viewBoxRegex,
                        `viewBox="${newViewBox}"`,
                      );
                    }
                  }
                }
              }

              const optimized = optimize(svgString, {
                multipass: true,
                plugins: [
                  {
                    name: "preset-default",
                    params: {
                      overrides: {
                        cleanupNumericValues: false,
                      },
                    },
                  },
                  "sortAttrs",
                  {
                    name: "addAttributesToSVGElement",
                    params: {
                      attributes: [{ xmlns: "http://www.w3.org/2000/svg" }],
                    },
                  },
                ],
              });
              if (optimized.data) {
                fs.writeFileSync(filePath, optimized.data);
              } else {
                fs.writeFileSync(filePath, Buffer.from(svgString));
              }
            } catch (e) {
              console.warn(
                `SVGO optimization failed for extracted SVG, using raw: ${e.message}`,
              );
              fs.writeFileSync(filePath, buffer);
            }
          } else {
            fs.writeFileSync(filePath, buffer);
          }
          totalExtracted++;
        }

        // Construct new URL
        const newUrl = `/${ASSETS_DIR}/${filename}`;
        modified = true;

        // Determine attribute name based on method call is tricky inside generic replacer if we don't know which regex matched.
        // BUT, we can infer it or just pass it in? No, `replaceAll` doesn't pass custom args.
        // However, we are reconstructing the tag.
        // `fullMatch` is `<img... src="..." ...>` or `<source... srcset="..." ...>`
        // We can just replace the capture group content? No, replaceAll callback needs to return the WHOLE string.
        // Wait, the regex captures:
        // 1: preAttrs (e.g. ` class="foo" `)
        // 2: quote (" or ')
        // 3: srcContent (the data uri)
        // 4: postAttrs (e.g. ` alt="bar"`)
        // It DOES NOT capture the tag name ("img" or "source") or the attribute name ("src" or "srcset").
        // Use the start of fullMatch to detect?

        let tagName = "img";
        let attrName = "src";
        if (fullMatch.toLowerCase().startsWith("<source")) {
          tagName = "source";
          attrName = "srcset";
        }

        // Reconstruct the tag
        return `<${tagName}${preAttrs} ${attrName}=${quote}${newUrl}${quote}${postAttrs}>`;
      } catch (err) {
        console.warn(`Failed to process Data URI in ${file}: ${err.message}`);
        return fullMatch; // Do not replace if error
      }
    };

    content = content.replaceAll(IMG_TAG_REGEX, replacer);
    content = content.replaceAll(SOURCE_TAG_REGEX, replacer);

    // Post-process Mermaid Picture tags to support Manual Theme Toggle via CSS
    const MERMAID_PICTURE_REGEX =
      /<picture>\s*<source\s+([^>]*?)srcset="([^"]+)"\s*([^>]*?)>\s*<img\s+([^>]*?)src="([^"]+)"\s*([^>]*?)>\s*<\/picture>/gi;
    content = content.replaceAll(
      MERMAID_PICTURE_REGEX,
      (match, sPre, darkUrl, sPost, iPre, lightUrl, iPost) => {
        if (!match.includes("mermaid-")) return match;

        // Remove 'media' attribute from source parts
        const cleanSPre = sPre
          .replace(/media="[^"]*"/g, "")
          .replace(/srcset="[^"]*"/g, ""); // srcset is captured, ensure we dont dupe
        const cleanSPost = sPost
          .replace(/media="[^"]*"/g, "")
          .replace(/srcset="[^"]*"/g, "");

        // Source tag is void, so it doesn't have closing tag usually, but we are making it an img
        // It might have width/height.

        return `<div class="mermaid-wrapper">
            <img src="${darkUrl}" ${cleanSPre} ${cleanSPost} class="mermaid-dark" />
            <img src="${lightUrl}" ${iPre} ${iPost} class="mermaid-light" />
        </div>`;
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
