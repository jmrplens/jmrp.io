import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { glob } from "glob";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { CspData } from "./types.js";
import { writeHtml, getFileHash, resolveFile } from "./utils.js";
import {
  ASSETS_DIR,
  STYLE_CLASS_HASH_LENGTH,
  ASSET_FILENAME_HASH_LENGTH,
} from "./constants.js";

/**
 * processHtmlFiles: Consolidated pass for all HTML transformations
 */
export async function processHtmlFiles(distDir: string, cspData: CspData) {
  console.log("[PostBuild] Processing HTML files (consolidated pass)...");
  const htmlFiles = await glob("**/*.html", { cwd: distDir, absolute: true });
  const hashCache = new Map<string, string>();
  const targetDir = path.join(distDir, ASSETS_DIR);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  let modifiedFilesCount = 0;
  let updatedSriTags = 0;
  let extractedDataUris = 0;

  for (const file of htmlFiles) {
    const content = fs.readFileSync(file, "utf-8");
    const $ = cheerio.load(content);
    let isModified = false;

    // 1. moveInlineStyles logic (converts style="..." to classes)
    const styleToClassMap = new Map<string, string>();
    $("[style]").each((_, el) => {
      const $el = $(el);
      const styleContent = $el.attr("style");
      if (!styleContent) return;

      const hash = crypto
        .createHash("shake256", { outputLength: STYLE_CLASS_HASH_LENGTH })
        .update(styleContent)
        .digest("hex");
      const className = `sh-${hash}`;
      styleToClassMap.set(styleContent, className);

      $el.removeAttr("style");
      $el.addClass(className);
      isModified = true;
    });

    if (styleToClassMap.size > 0) {
      let cssRules = "";
      for (const [styleDef, className] of styleToClassMap.entries()) {
        cssRules += `.${className}{${styleDef}}`;
      }
      // Add a marker to identify generated styles and avoid re-noncing them
      $("head").append(
        `<style nonce="NGINX_CSP_NONCE" data-generated-style="true">${cssRules}</style>`,
      );
      isModified = true;
    }

    // 2. extractHtmlImgDataUris logic
    $('img[src^="data:"], source[srcset^="data:"]').each((_, el) => {
      const $el = $(el);
      const tagName = el.tagName;
      const attrName = tagName === "source" ? "srcset" : "src";
      const srcContent = $el.attr(attrName);

      if (!srcContent || !srcContent.trim().startsWith("data:")) return;

      try {
        const commaIndex = srcContent.indexOf(",");
        if (commaIndex === -1) return;

        const metadata = srcContent.substring(5, commaIndex);
        const rawData = srcContent.substring(commaIndex + 1);
        const isBase64 = metadata.endsWith(";base64");

        const buffer = isBase64
          ? Buffer.from(rawData, "base64")
          : Buffer.from(decodeURIComponent(rawData.trim()));

        const hash = crypto
          .createHash("sha256")
          .update(buffer)
          .digest("hex")
          .substring(0, ASSET_FILENAME_HASH_LENGTH);
        const filename = `${hash}.bin`; // Default to bin for HTML extractions for now
        const filePath = path.join(targetDir, filename);

        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, buffer);
          extractedDataUris++;
        }

        $el.attr(attrName, `/${ASSETS_DIR}/${filename}`);
        isModified = true;
      } catch {
        /* ignore */
      }
    });

    // 3. SRI and Nonces for linked resources
    const processSri = (
      $el: cheerio.Cheerio<Element>,
      attr: string,
      type: "script" | "link",
    ) => {
      const url = $el.attr(attr);
      if (!url) return;

      const rel = $el.attr("rel");
      const as = $el.attr("as");

      if (
        type === "script" ||
        rel === "stylesheet" ||
        as === "style" ||
        as === "script" ||
        as === "font"
      ) {
        if (!$el.attr("crossorigin")) {
          $el.attr("crossorigin", "anonymous");
          isModified = true;
        }
      }

      if (!$el.attr("integrity")) {
        const filePath = resolveFile(url, path.dirname(file), distDir);
        if (filePath) {
          const hash = getFileHash(filePath, hashCache);
          $el.attr("integrity", hash);
          isModified = true;
          updatedSriTags++;
        }
      }

      if (
        !$el.attr("nonce") &&
        (type === "script" || rel === "stylesheet" || as === "style")
      ) {
        $el.attr("nonce", "NGINX_CSP_NONCE");
        isModified = true;
      }
    };

    $("script[src]").each((_, el) => processSri($(el), "src", "script"));
    $(
      'link[rel="stylesheet"], link[rel="preload"], link[rel="modulepreload"]',
    ).each((_, el) => processSri($(el), "href", "link"));

    // 4. Collect hashes for ALL inline content AND add nonces
    // Prioritizing hashes means we calculate them, but we still keep nonces for Mermaid/Astro stability
    $("style:not([data-generated-style])").each((_, el) => {
      const $el = $(el);
      const styleHtml = $el.html() || "";
      const h = crypto.createHash("sha512").update(styleHtml).digest("base64");
      cspData.styleHashes.add(`'sha512-${h}'`);

      if (!$el.attr("nonce")) {
        $el.attr("nonce", "NGINX_CSP_NONCE");
        isModified = true;
      }
    });

    $("script:not([src])").each((_, el) => {
      const $el = $(el);
      const scriptHtml = $el.html() || "";
      const h = crypto.createHash("sha512").update(scriptHtml).digest("base64");
      cspData.scriptHashes.add(`'sha512-${h}'`);

      if (!$el.attr("nonce")) {
        $el.attr("nonce", "NGINX_CSP_NONCE");
        isModified = true;
      }
    });

    // 5. Collect image domains for CSP (and validate)
    const HOSTNAME_REGEX = /^[A-Za-z0-9.-]+$/;
    $("img[src]").each((_, el) => {
      const src = $(el).attr("src");
      if (src && (src.startsWith("http") || src.startsWith("//"))) {
        try {
          const fullUrl = src.startsWith("//") ? `https:${src}` : src;
          const hostname = new URL(fullUrl).hostname;
          if (HOSTNAME_REGEX.test(hostname)) {
            cspData.imageDomains.add(hostname);
          }
        } catch {
          /* ignore */
        }
      }
    });

    // 6. Manual Beacon Replace
    let finalHtml = $.html();
    if (finalHtml.includes("__BEACON_INTEGRITY_HASH__")) {
      const beaconPath = path.join(distDir, "scripts", "cf-beacon.js");
      if (fs.existsSync(beaconPath)) {
        const hash = getFileHash(beaconPath, hashCache);
        finalHtml = finalHtml.replaceAll("__BEACON_INTEGRITY_HASH__", hash);
        isModified = true;
      }
    }

    if (isModified) {
      writeHtml(file, finalHtml);
      modifiedFilesCount++;
    }
  }

  console.log(`  ✓ Updated ${updatedSriTags} tags with SRI.`);
  console.log(`  ✓ Extracted ${extractedDataUris} data URIs from HTML.`);
  console.log(`  ✓ Modified ${modifiedFilesCount} HTML files.`);
}
