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
import * as cheerio from "cheerio";

const DIST_DIR = path.resolve(
  process.argv[2] || process.env.DIST_DIR || "dist",
);

/**
 * Validates that a path is within the DIST_DIR
 */
function isPathSafe(filePath) {
  const resolvedPath = path.resolve(filePath);
  const relative = path.relative(DIST_DIR, resolvedPath);
  return !relative.startsWith("..");
}

async function moveInlineStyles() {
  console.log(`Scanning ${DIST_DIR} for inline styles to extract...`);
  const files = await glob("**/*.html", { cwd: DIST_DIR, absolute: true });

  let totalReplacements = 0;
  let totalFilesModified = 0;

  for (const file of files) {
    if (!isPathSafe(file)) {
      console.warn(`Skipping file with unsafe path: ${file}`);
      continue;
    }
    // deepcode ignore PT: file is validated by isPathSafe()
    const content = fs.readFileSync(file, "utf-8");
    const $ = cheerio.load(content);
    let modified = false;

    const styleToClassMap = new Map();

    $("[style]").each((_, el) => {
      const $el = $(el);
      const styleContent = $el.attr("style");

      if (!styleContent) return;

      // Generate short deterministic class name from style content
      if (!styleToClassMap.has(styleContent)) {
        const hash = crypto
          .createHash("shake256", { outputLength: 4 })
          .update(styleContent)
          .digest("hex");
        styleToClassMap.set(styleContent, `sh-${hash}`);
      }
      const newClassName = styleToClassMap.get(styleContent);

      $el.removeAttr("style");
      $el.addClass(newClassName);

      modified = true;
      totalReplacements++;
    });

    if (modified) {
      let cssRules = "";
      for (const [styleDef, className] of styleToClassMap.entries()) {
        cssRules += `.${className}{${styleDef}}`;
      }

      // Add Nginx nonce placeholder for CSP compatibility
      const styleBlock = `<style nonce="NGINX_CSP_NONCE">${cssRules}</style>`;
      $("head").append(styleBlock);

      fs.writeFileSync(file, $.html(), "utf-8");
      totalFilesModified++;
    }
  }

  console.log(`Extraction complete.`);
  console.log(`Modified ${totalFilesModified} files.`);
  console.log(`Replaced ${totalReplacements} inline style attributes.`);
}

await moveInlineStyles();
