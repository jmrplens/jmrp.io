/**
 * Inline Style to Class Converter
 *
 * This script scans generated HTML for inline 'style' attributes and moves
 * them into a <style> block in the <head>.
 *
 * Purpose:
 * - Content-Security-Policy (CSP) Compliance: Allows using a strict CSP without
 *   'unsafe-inline' by hashing or noncing the resulting <style> blocks.
 * - Deduplication: Identical inline styles across elements are consolidated
 *   into a single CSS class.
 */

import fs from "node:fs";
import { glob } from "glob";
import crypto from "node:crypto";
import path from "node:path";

const DIST_DIR = path.resolve(
  process.argv[2] || process.env.DIST_DIR || "dist",
);

/**
 * Validates that a path is within the DIST_DIR
 */
function isPathSafe(filePath) {
  const resolvedPath = path.resolve(filePath);
  const relative = path.relative(DIST_DIR, resolvedPath);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function moveInlineStyles() {
  console.log(`Scanning ${DIST_DIR} for inline styles to extract...`);
  const files = await glob("**/*.html", { cwd: DIST_DIR, absolute: true });

  let totalReplacements = 0;
  let totalFilesModified = 0;

  for (const file of files) {
    if (!isPathSafe(file)) continue;
    // deepcode ignore PT: file is validated by isPathSafe()
    let content = fs.readFileSync(file, "utf-8");
    let modified = false;

    const styleToClassMap = new Map();

    // Regex to capture elements with 'style' attribute
    const TAG_REGEX = /(<[\w-]+)([^>]*)\s+style=(["'])(.*?)\3([^>]*)(>)/gi; // NOSONAR javascript:S5852

    content = content.replaceAll(
      TAG_REGEX,
      (_match, tagStart, preAttrs, _quote, styleContent, postAttrs, tagEnd) => {
        preAttrs = preAttrs || "";
        postAttrs = postAttrs || "";

        // Generate short deterministic class name from style content
        if (!styleToClassMap.has(styleContent)) {
          const hash = crypto
            .createHash("shake256", { outputLength: 4 })
            .update(styleContent)
            .digest("hex");
          styleToClassMap.set(styleContent, `sh-${hash}`);
        }
        const newClassName = styleToClassMap.get(styleContent);

        modified = true;
        totalReplacements++;

        const classAttrRegex = /class=(["'])(.*?)\1/;
        const injectClass = (attrs) => {
          return attrs.replace(classAttrRegex, (m, q, c) => {
            if (c.split(/\s+/).includes(newClassName)) return m;
            return `class=${q}${c} ${newClassName}${q}`;
          });
        };

        if (classAttrRegex.test(preAttrs)) {
          preAttrs = injectClass(preAttrs);
          return `${tagStart}${preAttrs}${postAttrs}${tagEnd}`;
        } else if (classAttrRegex.test(postAttrs)) {
          postAttrs = injectClass(postAttrs);
          return `${tagStart}${preAttrs}${postAttrs}${tagEnd}`;
        } else {
          return `${tagStart}${preAttrs} class="${newClassName}"${postAttrs}${tagEnd}`;
        }
      },
    );

    if (modified) {
      let cssRules = "";
      for (const [styleDef, className] of styleToClassMap.entries()) {
        cssRules += `.${className}{${styleDef}}`;
      }

      // Add Nginx nonce placeholder for CSP compatibility
      const styleBlock = `<style nonce="NGINX_CSP_NONCE">${cssRules}</style>`;

      if (content.includes("</head>")) {
        content = content.replace("</head>", `${styleBlock}</head>`);
      } else {
        content += styleBlock;
      }

      fs.writeFileSync(file, content, "utf-8");
      totalFilesModified++;
    }
  }

  console.log(`Extraction complete.`);
  console.log(`Modified ${totalFilesModified} files.`);
  console.log(`Replaced ${totalReplacements} inline style attributes.`);
}

await moveInlineStyles();
