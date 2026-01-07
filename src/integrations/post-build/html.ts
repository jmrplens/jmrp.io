import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { glob } from "glob";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { CspData } from "./types.js";
import {
  writeHtml,
  getExtensionFromMime,
  getFileHash,
  resolveFile,
} from "./utils.js";
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

    // 1. moveInlineStyles logic
    const styleToClassMap = new Map<string, string>();
    $("[style]").each((_, el) => {
      const $el = $(el);
      const styleContent = $el.attr("style");
      if (!styleContent) return;

      if (!styleToClassMap.has(styleContent)) {
        const hash = crypto
          .createHash("shake256", { outputLength: STYLE_CLASS_HASH_LENGTH })
          .update(styleContent)
          .digest("hex");
        styleToClassMap.set(styleContent, `sh-${hash}`);
      }
      const newClassName = styleToClassMap.get(styleContent)!;
      $el.removeAttr("style");
      $el.addClass(newClassName);
      isModified = true;
    });

    if (styleToClassMap.size > 0) {
      let cssRules = "";
      for (const [styleDef, className] of styleToClassMap.entries()) {
        cssRules += `.${className}{${styleDef}}`;
      }
      $("head").append(`<style nonce="NGINX_CSP_NONCE">${cssRules}</style>`);
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
        const mimeType = isBase64 ? metadata.slice(0, -7) : metadata;

        const buffer = isBase64
          ? Buffer.from(rawData, "base64")
          : Buffer.from(decodeURIComponent(rawData.trim()));

        const ext = getExtensionFromMime(mimeType);
        const hash = crypto
          .createHash("sha256")
          .update(buffer)
          .digest("hex")
          .substring(0, ASSET_FILENAME_HASH_LENGTH);
        const filename = `${hash}.${ext}`;
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

    // 3. generateSriHashes logic (and nonces)
    const processSri = (
      $el: cheerio.Cheerio<Element>,
      attr: string,
      type: "script" | "link" | "img",
    ) => {
      const url = $el.attr(attr);
      if (!url) return;

      // Handle image preloads separately (crossorigin only)
      const rel = $el.attr("rel");
      const as = $el.attr("as");
      if (rel === "preload" && as === "image") {
        if (!$el.attr("crossorigin")) {
          $el.attr("crossorigin", "anonymous");
          isModified = true;
          updatedSriTags++;
        }
        return;
      }

      if ($el.attr("integrity")) return;

      const filePath = resolveFile(url, path.dirname(file), distDir);
      if (!filePath) return;

      const hash = getFileHash(filePath, hashCache);
      $el.attr("integrity", hash);
      if (!$el.attr("crossorigin")) $el.attr("crossorigin", "anonymous");

      if (
        !$el.attr("nonce") &&
        (type === "script" || rel === "stylesheet" || as === "style")
      ) {
        $el.attr("nonce", "NGINX_CSP_NONCE");
      }

      isModified = true;
      updatedSriTags++;
    };

    $("script[src]").each((_, el) => processSri($(el), "src", "script"));
    $(
      'link[rel="stylesheet"], link[rel="preload"], link[rel="modulepreload"]',
    ).each((_, el) => processSri($(el), "href", "link"));
    $("img[src], source[src], source[srcset]").each((_, el) => {
      const $el = $(el);
      const tagName = el.tagName;
      const attr =
        tagName === "source" && $el.attr("srcset") ? "srcset" : "src";
      processSri($el, attr, "img");
    });

    // Astro Islands modulepreload injection
    const moduleUrls = new Set<string>();
    $("astro-island").each((_, el) => {
      const $el = $(el);
      const comp = $el.attr("component-url");
      const rend = $el.attr("renderer-url");
      if (comp) moduleUrls.add(comp);
      if (rend) moduleUrls.add(rend);
    });

    for (const url of moduleUrls) {
      if (
        $('link[rel="modulepreload"]').filter(
          (_, el) => $(el).attr("href") === url,
        ).length === 0
      ) {
        const filePath = resolveFile(url, path.dirname(file), distDir);
        if (filePath) {
          const hash = getFileHash(filePath, hashCache);
          $("head").append(
            `<link rel="modulepreload" href="${url}" nonce="NGINX_CSP_NONCE" integrity="${hash}" crossorigin="anonymous">`,
          );
          isModified = true;
          updatedSriTags++;
        }
      }
    }

    // 4. collectCspData logic (from HTML)
    $("style").each((_, el) => {
      const $el = $(el);
      if (!$el.attr("nonce")) {
        const h = crypto
          .createHash("sha512")
          .update($el.html() || "")
          .digest("base64");
        cspData.styleHashes.add(`'sha512-${h}'`);
      }
    });

    $("script:not([src])").each((_, el) => {
      const $el = $(el);
      if (!$el.attr("nonce")) {
        const h = crypto
          .createHash("sha512")
          .update($el.html() || "")
          .digest("base64");
        cspData.scriptHashes.add(`'sha512-${h}'`);
      }
    });

    $("img[src]").each((_, el) => {
      const $el = $(el);
      const src = $el.attr("src");
      if (src && (src.startsWith("http") || src.startsWith("//"))) {
        try {
          const fullUrl = src.startsWith("//") ? `https:${src}` : src;
          cspData.imageDomains.add(new URL(fullUrl).hostname);
        } catch {
          /* ignore */
        }
      }
    });

    // 5. Manual Beacon Replace
    let finalHtml = $.html();
    if (finalHtml.includes("__BEACON_INTEGRITY_HASH__")) {
      const beaconPath = path.join(distDir, "scripts", "cf-beacon.js");
      if (fs.existsSync(beaconPath)) {
        const hash = getFileHash(beaconPath, hashCache);
        finalHtml = finalHtml.replaceAll("__BEACON_INTEGRITY_HASH__", hash);
        isModified = true;
        updatedSriTags++;
      }
    }

    if (isModified) {
      writeHtml(file, finalHtml);
      modifiedFilesCount++;
    }
  }

  console.log(`  ✓ Updated ${updatedSriTags} tags with SRI/Nonces.`);
  console.log(`  ✓ Extracted ${extractedDataUris} data URIs from HTML.`);
  console.log(`  ✓ Modified ${modifiedFilesCount} HTML files.`);
}
