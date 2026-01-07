import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { glob } from "glob";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { CspData } from "./types.js";
import { writeHtml, getFileHash, resolveFile } from "./utils.js";

/**
 * processHtmlFiles: Consolidated pass for all HTML transformations
 */
export async function processHtmlFiles(distDir: string, cspData: CspData) {
  console.log("[PostBuild] Processing HTML files (consolidated pass)...");
  const htmlFiles = await glob("**/*.html", { cwd: distDir, absolute: true });
  const hashCache = new Map<string, string>();

  let modifiedFilesCount = 0;
  let updatedSriTags = 0;

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
        .createHash("shake256", { outputLength: 4 })
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
      $("head").append(`<style nonce="NGINX_CSP_NONCE">${cssRules}</style>`);
      isModified = true;
    }

    // 2. Add nonces to ALL inline scripts and styles (essential for Mermaid and Astro islands)
    $("script:not([src]), style:not([nonce])").each((_, el) => {
      $(el).attr("nonce", "NGINX_CSP_NONCE");
      isModified = true;
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

      // Ensure crossorigin for standard SRI-eligible resources
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

      // Add Integrity if local and not already present
      if (!$el.attr("integrity")) {
        const filePath = resolveFile(url, path.dirname(file), distDir);
        if (filePath) {
          const hash = getFileHash(filePath, hashCache);
          $el.attr("integrity", hash);
          isModified = true;
          updatedSriTags++;
        }
      }

      // Add Nonce to scripts and styles
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

    // 4. Collect image domains for CSP
    $("img[src]").each((_, el) => {
      const src = $(el).attr("src");
      if (src && (src.startsWith("http") || src.startsWith("//"))) {
        try {
          const fullUrl = src.startsWith("//") ? `https:${src}` : src;
          cspData.imageDomains.add(new URL(fullUrl).hostname);
        } catch {
          /* ignore */
        }
      }
    });

    // 5. Manual Beacon Replace (Cloudflare)
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
  console.log(`  ✓ Modified ${modifiedFilesCount} HTML files.`);
}
