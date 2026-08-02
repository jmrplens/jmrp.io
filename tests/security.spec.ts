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
 * Note: Nonces are placeholders ("nonce-$cspNonce") in static builds,
 * replaced at runtime by Nginx with unique per-request values.
 *
 * Per-page tests run in parallel across workers for maximum performance.
 * Dynamically tests all pages discovered from the sitemap.
 */

import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { getCachedPages } from "./utils";

// Read pages synchronously at module scope for parallel test registration
const pages = getCachedPages();

/**
 * Validates the integrity hash of a resource.
 * @param url - Source URL of the page being tested.
 * @param resourceUrl - URL of the script/stylesheet.
 * @param integrity - SRI hash string.
 * @param type - Resource type for logging.
 * @returns Error message if invalid, null if valid.
 */
function validateIntegrity(
  url: string,
  resourceUrl: string | null,
  integrity: string | null,
  type: "Script" | "Stylesheet",
): string | null {
  // Skip external URLs (various forms)
  if (
    !resourceUrl ||
    resourceUrl.startsWith("http://") ||
    resourceUrl.startsWith("https://") ||
    resourceUrl.startsWith("//") ||
    resourceUrl.startsWith("data:") ||
    resourceUrl.startsWith("blob:")
  ) {
    return null;
  }

  // Skip cf-beacon.js - intentionally excluded from SRI in post-build to avoid cache/update issues
  if (resourceUrl.includes("cf-beacon.js")) {
    return null;
  }

  if (!integrity) {
    return `${url}: ${type} ${resourceUrl} missing integrity attribute`;
  }

  // Validate SRI format: one or more space-separated hashes
  const sriPattern = /^sha(256|384|512)-[A-Za-z0-9+/]+=*$/;
  const tokens = integrity.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return `${url}: ${type} ${resourceUrl} has empty integrity attribute`;
  }
  for (const token of tokens) {
    if (!sriPattern.test(token)) {
      return `${url}: ${type} ${resourceUrl} has invalid SRI token: ${token}`;
    }
  }

  return null;
}

interface ResourceData {
  url: string | null;
  integrity: string | null;
}

/**
 * Gathers data for external resources (scripts/stylesheets) at a given index.
 */
async function getResourceData(
  locator: import("@playwright/test").Locator,
  index: number,
  type: "src" | "href",
): Promise<ResourceData> {
  const el = locator.nth(index);
  return {
    url: await el.getAttribute(type),
    integrity: await el.getAttribute("integrity"),
  };
}

interface InlineScriptData {
  nonce: string | null;
  hasContent: boolean;
  content: string;
  type: string;
}

/**
 * Gathers data for an inline script at a given index.
 */
async function getInlineScriptData(
  locator: import("@playwright/test").Locator,
  index: number,
): Promise<InlineScriptData> {
  const script = locator.nth(index);
  const [attrNonce, propNonce, content, type] = await Promise.all([
    script.getAttribute("nonce"),
    script.evaluate((node) => (node as HTMLScriptElement).nonce),
    script.textContent(),
    script.getAttribute("type"),
  ]);

  return {
    nonce: attrNonce || propNonce || null,
    hasContent: !!(content && content.trim().length > 0),
    content: (content || "").slice(0, 40).replaceAll("\n", " "),
    type: type || "inline",
  };
}

interface StyleElementData {
  tagName: string;
  style: string | null;
}

/**
 * Gathers tag name and style attribute for an element at a given index.
 */
async function getStyleElementData(
  locator: import("@playwright/test").Locator,
  index: number,
): Promise<StyleElementData> {
  const el = locator.nth(index);
  const [tagName, style] = await Promise.all([
    el.evaluate((node) => node.tagName.toLowerCase()),
    el.getAttribute("style"),
  ]);
  return { tagName, style };
}

test.describe("CSP and SRI Security Checks", () => {
  for (const pageInfo of pages) {
    test(`CSP & SRI: ${pageInfo.name}`, async ({ page }) => {
      await page.goto(pageInfo.url);

      // --- Script nonce placeholders ---
      await test.step("Scripts have nonce placeholders", async () => {
        const scriptsWithSrc = page.locator("script[src]");
        const count = await scriptsWithSrc.count();

        for (let i = 0; i < count; i++) {
          const script = scriptsWithSrc.nth(i);
          await expect(script).toHaveAttribute("nonce", /.+/);
        }
      });

      // --- SRI integrity hashes ---
      await test.step("SRI integrity hashes", async () => {
        const scripts = page.locator("script[src]");
        const scriptCount = await scripts.count();
        const scriptData = await Promise.all(
          Array.from({ length: scriptCount }).map((_, i) =>
            getResourceData(scripts, i, "src"),
          ),
        );

        const stylesheets = page.locator("link[rel='stylesheet'][href]");
        const styleCount = await stylesheets.count();
        const styleData = await Promise.all(
          Array.from({ length: styleCount }).map((_, i) =>
            getResourceData(stylesheets, i, "href"),
          ),
        );

        const issues = [
          ...scriptData
            .map((s) =>
              validateIntegrity(pageInfo.url, s.url, s.integrity, "Script"),
            )
            .filter((e): e is string => e !== null),
          ...styleData
            .map((s) =>
              validateIntegrity(pageInfo.url, s.url, s.integrity, "Stylesheet"),
            )
            .filter((e): e is string => e !== null),
        ];

        expect(issues, "SRI integrity hash issues").toEqual([]);
      });

      // --- Inline script nonces ---
      await test.step("Inline scripts have nonce", async () => {
        const inlineScripts = page.locator("script:not([src])");
        const count = await inlineScripts.count();

        const scriptData = await Promise.all(
          Array.from({ length: count }).map((_, i) =>
            getInlineScriptData(inlineScripts, i),
          ),
        );

        for (const data of scriptData) {
          expect(
            data.hasContent && !data.nonce ? "missing" : "ok",
            `[${pageInfo.url}] ${data.type} script missing nonce. Preview: "${data.content}..."`,
          ).toBe("ok");
        }
      });

      // --- No inline style attributes ---
      await test.step("No inline style attributes", async () => {
        const STYLE_EXCLUSION_SELECTOR = `[style]:not([style=""]):not([style*="display: block"]):not([style*="display:block"]):not([style*="display: none"]):not([style*="display:none"]):not([id="preact-border-shadow-host"]):not(rect):not(g):not(path):not(line):not(text):not(polygon):not(circle):not(ellipse)`;
        const locator = page.locator(STYLE_EXCLUSION_SELECTOR);
        const count = await locator.count();

        const elementData = await Promise.all(
          Array.from({ length: count }).map((_, i) =>
            getStyleElementData(locator, i),
          ),
        );

        const violations = elementData
          .filter((data) => data.style && data.style.trim() !== "")
          .filter((data) => {
            const styleStr = data.style ?? "";
            const cleaned = styleStr
              .split(";")
              .map((s: string) => s.trim())
              .filter((s: string) => s !== "");
            return cleaned.some((prop: string) => !prop.startsWith("--"));
          })
          .map(
            (data) =>
              `${pageInfo.url}: <${data.tagName} style="${data.style}">`,
          );

        expect(violations, "Unexpected inline style attributes").toEqual([]);
      });

      // --- Style tag nonces ---
      await test.step("Style tags have nonce", async () => {
        const styleTags = page.locator("style");
        const count = await styleTags.count();

        for (let i = 0; i < count; i++) {
          const style = styleTags.nth(i);
          await expect(
            style,
            `Style tag should have a nonce attribute`,
          ).toHaveAttribute("nonce", /.+/);
        }
      });
    });
  }
});

test.describe("Build Output Verification", () => {
  test("security_headers.conf is generated after build", () => {
    const distDir = path.resolve("dist");
    const headersPath = path.join(distDir, "security_headers.conf");

    expect(
      fs.existsSync(headersPath),
      "security_headers.conf should exist in dist/",
    ).toBe(true);

    const content = fs.readFileSync(headersPath, "utf-8");

    expect(content).toContain("Content-Security-Policy");
    expect(content).toContain("nonce-$cspNonce");
    expect(content).toContain("script-src");
    expect(content).toContain("style-src");
    expect(content).toContain("Strict-Transport-Security");
    expect(content).toContain("X-Frame-Options");
    // Nonce-only CSP: no hash variables should be present
    expect(content).not.toMatch(/\$csp_script_\d+/);
    expect(content).not.toMatch(/\$csp_style_\d+/);
  });

  test("CSP header contains required directives", () => {
    const distDir = path.resolve("dist");
    const headersPath = path.join(distDir, "security_headers.conf");

    expect(
      fs.existsSync(headersPath),
      `security_headers.conf should exist at ${headersPath}`,
    ).toBe(true);

    const content = fs.readFileSync(headersPath, "utf-8");

    // Extract the CSP line using optimized RegExp.exec()
    const cspRegex = /Content-Security-Policy "([^"]+)"/;
    const cspMatch = cspRegex.exec(content);
    expect(cspMatch, "CSP header should be present").toBeTruthy();

    const cspPolicy = cspMatch![1];

    // Parse CSP into discrete directive names to avoid false substring matches
    const directiveSegments = cspPolicy
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const directiveNames = new Set(
      directiveSegments.map((seg) => seg.split(/\s+/, 1)[0]),
    );

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
      expect(
        directiveNames.has(directive),
        `CSP should contain ${directive} directive`,
      ).toBe(true);
    }

    expect(cspPolicy).toContain("default-src 'none'");
    expect(cspPolicy).toContain("worker-src 'self'");
    expect(cspPolicy).toContain("frame-src 'none'");
    expect(cspPolicy).toContain("object-src 'none'");
    // Value, not just presence: post 003 calls base-uri 'none' mandatory for a
    // strict CSP, and production shipped the laxer 'self' until #381.
    expect(cspPolicy).toContain("base-uri 'none'");
    expect(cspPolicy).toContain("frame-ancestors 'none'");
  });

  test("no dummy session cookies on HTML responses", () => {
    const distDir = path.resolve("dist");
    const headersPath = path.join(distDir, "security_headers.conf");

    expect(
      fs.existsSync(headersPath),
      `security_headers.conf should exist at ${headersPath}`,
    ).toBe(true);

    const content = fs.readFileSync(headersPath, "utf-8");

    // Both were pinned to the constant 1 with no session or preference
    // behind them: dead overhead on every HTML response.
    expect(content).not.toContain("__Host-Session");
    expect(content).not.toContain("__Secure-Pref");
  });
});
