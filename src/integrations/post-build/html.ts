import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { glob } from "glob";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { CspData } from "./types.js";
import { writeHtml, getFileHash, resolveFile } from "./utils.js";
import { ASSETS_DIR, STYLE_CLASS_HASH_LENGTH } from "./constants.js";

/**
 * Performs a consolidated pass over all HTML files in the distribution directory.
 *
 * This function handles several critical post-build tasks:
 * 1. Converts inline style attributes to scoped classes (to support strict CSP).
 * 2. Injects security nonces into all inline script and style tags.
 * 3. Generates Subresource Integrity (SRI) hashes for all local linked resources.
 * 4. Collects hashes for the final CSP configuration.
 * 5. Identifies external image domains used on the site.
 * 6. Hardens the Cloudflare Insights beacon script with local environment guards.
 *
 * @param {string} distDir - The absolute path to the production build output.
 * @param {CspData} cspData - Shared object to store collected CSP hashes and domains.
 */
export async function processHtmlFiles(distDir: string, cspData: CspData) {
  console.log("[PostBuild] Processing HTML files (consolidated pass)...");
  const htmlFiles = await glob("**/*.html", { cwd: distDir, absolute: true });
  const hashCache = new Map<string, string>();
  const targetDir = path.join(distDir, ASSETS_DIR);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  // Special handling for cf-beacon.js to avoid Lighthouse errors while keeping SRI
  const beaconPath = path.join(distDir, "scripts", "cf-beacon.js");
  if (fs.existsSync(beaconPath)) {
    console.log("[PostBuild] Hardening cf-beacon.js with local guard...");
    const originalBeacon = fs.readFileSync(beaconPath, "utf-8");
    // Prepend a guard that stops execution on localhost/127.0.0.1
    // We wrap it in a function to allow 'return' at the top level of the logic
    const hardenedBeacon = `(function(){if(location.hostname.includes('localhost')||location.hostname.includes('127.0.0.1'))return;${originalBeacon}})();`;
    fs.writeFileSync(beaconPath, hardenedBeacon, "utf-8");
    // Force re-calculation of hash for this file
    hashCache.delete(beaconPath);
  }

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

    // 2. Add nonces to ALL inline scripts and styles (essential for Mermaid and Astro islands)
    // Consolidated into Step 4 for hashing, but we still need to catch any missed ones
    // like the ones that don't need hashing (e.g. data-generated-style already has it from Step 1)

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

    // 4. Collect hashes for ALL inline content AND add nonces
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

    // 5. Collect image domains for CSP
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

    // 6. Manual Beacon Replace (Cloudflare)
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
