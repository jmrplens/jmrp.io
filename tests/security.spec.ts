/**
 * Security Test Suite (CSP, SRI, Headers)
 *
 * Verifies the implementation of security best practices:
 * 1. Content Security Policy (CSP): Ensuring all scripts and styles have nonces.
 * 2. Subresource Integrity (SRI): Validating hashes for local external resources.
 * 3. Security Headers: Verifying the generation of `security_headers.conf` with
 *    HSTS, X-Frame-Options, and robust CSP directives.
 * 4. Inline Compliance: Checking that inline styles are converted to classes.
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
    const issues: string[] = [];

    for (const url of urls) {
      await test.step(`Checking inline script nonces: ${url}`, async () => {
        await page.goto(url);

        // Find all inline scripts (scripts without src attribute)
        // This includes regular inline scripts, module scripts, and JSON-LD
        const inlineScripts = page.locator("script:not([src])");
        const count = await inlineScripts.count();

        for (let i = 0; i < count; i++) {
          const script = inlineScripts.nth(i);

          // Check both attribute and property (browsers often hide the attribute for security)
          const [attrNonce, propNonce] = await Promise.all([
            script.getAttribute("nonce"),
            script.evaluate((node) => (node as HTMLScriptElement).nonce),
          ]);
          const nonce = attrNonce || propNonce;

          const type = await script.getAttribute("type");
          const content = await script.textContent();

          // All inline scripts with content should have a nonce
          // eslint-disable-next-line playwright/no-conditional-in-test
          if (content && content.trim() && !nonce) {
            const scriptType = type || "inline";
            const preview = content.slice(0, 40).replace(/\n/g, " ");
            issues.push(
              `${url}: ${scriptType} script missing nonce: "${preview}..."`,
            );
          }
        }
      });
    }

    // All inline scripts must have nonces for CSP compliance
    expect(
      issues,
      "All inline scripts should have nonce attribute for CSP compliance",
    ).toEqual([]);
  });

  test("no elements have inline style attributes (CSP compliance)", async ({
    page,
  }) => {
    const urls = await getSitemapUrls();
    const elementsWithStyle: string[] = [];

    for (const url of urls) {
      await test.step(`Checking inline styles: ${url}`, async () => {
        await page.goto(url);

        // Find all elements with a style attribute
        const styleAttrElements = page.locator("[style]");
        const count = await styleAttrElements.count();

        for (let i = 0; i < count; i++) {
          const el = styleAttrElements.nth(i);
          const tagName = await el.evaluate((node) =>
            node.tagName.toLowerCase(),
          );
          const style = await el.getAttribute("style");

          // Skip dynamic styles known to be added by JS (visibility toggles)
          // These are safe as they are managed by nonced scripts and aren't in SSR HTML
          // eslint-disable-next-line playwright/no-conditional-in-test
          if (
            style &&
            (style.includes("display: block") ||
              style.includes("display: none"))
          ) {
            continue;
          }

          // Skip internal browser/tooling styles if any
          // eslint-disable-next-line playwright/no-conditional-in-test
          if (
            await el.evaluate((node) => node.id === "preact-border-shadow-host")
          ) {
            continue;
          }

          elementsWithStyle.push(`${url}: <${tagName} style="${style}">`);
        }
      });
    }

    // No elements should have inline style attributes (except visual toggles)
    // as they should be converted to classes by the post-build integration
    expect(
      elementsWithStyle,
      "Found unexpected inline style attributes (should have been converted to classes by post-build integration)",
    ).toEqual([]);
  });

  test("all style tags have nonce for CSP", async ({ page }) => {
    const urls = await getSitemapUrls();

    for (const url of urls) {
      await test.step(`Checking style nonces: ${url}`, async () => {
        await page.goto(url);

        const styleTags = page.locator("style");
        const count = await styleTags.count();

        for (let i = 0; i < count; i++) {
          const style = styleTags.nth(i);
          // Check for nonce attribute
          await expect(
            style,
            `Style tag at ${url} should have a nonce attribute`,
          ).toHaveAttribute("nonce", /.+/);
        }
      });
    }
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
