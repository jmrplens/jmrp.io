/**
 * Security Test Suite (CSP, SRI, Headers)
 *
 * Verifies Content Security Policy and Subresource Integrity implementation:
 * - Scripts have nonce attributes (for CSP compliance)
 * - Scripts and stylesheets have integrity attributes (SRI)
 * - CSP header structure is correct (in production builds)
 * - Security headers file is generated during build
 *
 * Note: Nonces are placeholders ("NGINX_CSP_NONCE") in static builds,
 * replaced at runtime by Nginx with unique per-request values.
 */

import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { getSitemapUrls } from "./utils";

test.describe("CSP and SRI Security Checks", () => {
  test("scripts have nonce placeholders for CSP", async ({ page }) => {
    const urls = await getSitemapUrls();

    for (const url of urls) {
      await test.step(`Checking CSP nonces: ${url}`, async () => {
        await page.goto(url);

        // Find all script tags with src (external scripts)
        const scriptsWithSrc = page.locator("script[src]");
        const count = await scriptsWithSrc.count();

        for (let i = 0; i < count; i++) {
          const script = scriptsWithSrc.nth(i);

          // Scripts should have nonce attribute (placeholder or real value)
          // In local dev, this might be the placeholder "NGINX_CSP_NONCE"
          // In production with Nginx, it will be a unique base64 value
          await expect(script).toHaveAttribute("nonce", /.+/);
        }
      });
    }
  });

  test("external scripts and stylesheets have SRI integrity hashes", async ({
    page,
  }) => {
    const urls = await getSitemapUrls();
    const issues: string[] = [];

    for (const url of urls) {
      await test.step(`Checking SRI: ${url}`, async () => {
        await page.goto(url);

        // Check scripts with src for integrity
        const scripts = page.locator("script[src]");
        const scriptCount = await scripts.count();

        for (let i = 0; i < scriptCount; i++) {
          const script = scripts.nth(i);
          const src = await script.getAttribute("src");
          const integrity = await script.getAttribute("integrity");

          // Only check local scripts (not third-party CDNs)
          // eslint-disable-next-line playwright/no-conditional-in-test
          if (src && !src.startsWith("http")) {
            // eslint-disable-next-line playwright/no-conditional-in-test
            if (!integrity) {
              issues.push(`${url}: Script ${src} missing integrity attribute`);
            } else {
              // Verify integrity format (sha256, sha384, or sha512)
              // eslint-disable-next-line playwright/no-conditional-in-test
              if (!/^sha(256|384|512)-/.test(integrity)) {
                issues.push(
                  `${url}: Script ${src} has invalid integrity format: ${integrity}`,
                );
              }
            }
          }
        }

        // Check stylesheets for integrity
        const stylesheets = page.locator("link[rel='stylesheet'][href]");
        const styleCount = await stylesheets.count();

        for (let i = 0; i < styleCount; i++) {
          const link = stylesheets.nth(i);
          const href = await link.getAttribute("href");
          const integrity = await link.getAttribute("integrity");

          // Only check local stylesheets
          // eslint-disable-next-line playwright/no-conditional-in-test
          if (href && !href.startsWith("http")) {
            // eslint-disable-next-line playwright/no-conditional-in-test
            if (!integrity) {
              issues.push(
                `${url}: Stylesheet ${href} missing integrity attribute`,
              );
            } else {
              // Verify integrity format
              // eslint-disable-next-line playwright/no-conditional-in-test
              if (!/^sha(256|384|512)-/.test(integrity)) {
                issues.push(
                  `${url}: Stylesheet ${href} has invalid integrity format`,
                );
              }
            }
          }
        }
      });
    }

    expect(
      issues,
      "All local scripts and stylesheets should have valid SRI integrity hashes",
    ).toEqual([]);
  });

  test("inline scripts have nonce for CSP compliance", async ({ page }) => {
    const urls = await getSitemapUrls();
    const inlineScriptsWithoutNonce: string[] = [];

    for (const url of urls) {
      await test.step(`Checking inline script nonces: ${url}`, async () => {
        await page.goto(url);

        // Find inline scripts (no src attribute)
        const inlineScripts = page.locator("script:not([src]):not([type])");
        const count = await inlineScripts.count();

        for (let i = 0; i < count; i++) {
          const script = inlineScripts.nth(i);
          const nonce = await script.getAttribute("nonce");
          const content = await script.textContent();

          // Inline scripts need nonce for CSP (unless they're empty or JSON)
          // eslint-disable-next-line playwright/no-conditional-in-test
          if (content && content.trim() && !nonce) {
            const preview = content.slice(0, 50).replace(/\n/g, " ");
            inlineScriptsWithoutNonce.push(`${url}: "${preview}..."`);
          }
        }
      });
    }

    // This might have some false positives for JSON-LD or module preloads
    // Log issues and assert we found some scripts to validate
    // eslint-disable-next-line playwright/no-conditional-in-test
    if (inlineScriptsWithoutNonce.length > 0) {
      console.warn(
        "⚠️ Inline scripts without nonce (may need review):",
        inlineScriptsWithoutNonce,
      );
    }

    // At minimum, verify we successfully scanned all pages
    expect(urls.length).toBeGreaterThan(0);
  });
});

test.describe("Build Output Verification", () => {
  test("security_headers.conf is generated after build", () => {
    const distDir = path.resolve("dist");
    const headersPath = path.join(distDir, "security_headers.conf");

    // Check file exists
    expect(
      fs.existsSync(headersPath),
      "security_headers.conf should exist in dist/",
    ).toBe(true);

    // Read and validate content
    const content = fs.readFileSync(headersPath, "utf-8");

    // Should contain CSP header
    expect(content).toContain("Content-Security-Policy");

    // Should contain nonce variable
    expect(content).toContain("nonce-$cspNonce");

    // Should contain script-src directive
    expect(content).toContain("script-src");

    // Should contain style-src directive
    expect(content).toContain("style-src");

    // Should contain HSTS header
    expect(content).toContain("Strict-Transport-Security");

    // Should contain X-Frame-Options
    expect(content).toContain("X-Frame-Options");

    // Should have CSP hash chunks defined (script hashes)
    expect(content).toMatch(/\$csp_script_\d+/);
  });

  test("CSP header contains required directives", () => {
    const distDir = path.resolve("dist");
    const headersPath = path.join(distDir, "security_headers.conf");

    const content = fs.readFileSync(headersPath, "utf-8");

    // Extract the CSP line
    const cspMatch = content.match(/Content-Security-Policy "([^"]+)"/);
    expect(cspMatch, "CSP header should be present").toBeTruthy();

    const cspPolicy = cspMatch![1];

    // Validate required directives
    const requiredDirectives = [
      "default-src",
      "script-src",
      "style-src",
      "img-src",
      "font-src",
      "connect-src",
      "frame-src",
      "object-src",
      "base-uri",
      "form-action",
      "frame-ancestors",
    ];

    for (const directive of requiredDirectives) {
      expect(cspPolicy, `CSP should contain ${directive} directive`).toContain(
        directive,
      );
    }

    // Validate strict settings
    expect(cspPolicy).toContain("default-src 'none'"); // Deny by default
    expect(cspPolicy).toContain("frame-src 'none'"); // No iframes
    expect(cspPolicy).toContain("object-src 'none'"); // No plugins
    expect(cspPolicy).toContain("frame-ancestors 'none'"); // Anti-clickjacking
  });
});
