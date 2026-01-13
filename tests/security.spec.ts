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
  if (!resourceUrl || resourceUrl.startsWith("http")) {
    return null;
  }

  if (!integrity) {
    return `${url}: ${type} ${resourceUrl} missing integrity attribute`;
  }

  if (!/^sha(256|384|512)-/.test(integrity)) {
    return `${url}: ${type} ${resourceUrl} has invalid integrity format: ${integrity}`;
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

test.describe("CSP and SRI Security Checks", () => {
  test("scripts have nonce placeholders for CSP", async ({ page }) => {
    const urls = await getSitemapUrls();

    for (const url of urls) {
      await test.step(`Checking CSP nonces: ${url}`, async () => {
        await page.goto(url);

        const scriptsWithSrc = page.locator("script[src]");
        const count = await scriptsWithSrc.count();

        for (let i = 0; i < count; i++) {
          const script = scriptsWithSrc.nth(i);
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

        // Gather scripts data
        const scripts = page.locator("script[src]");
        const scriptCount = await scripts.count();
        const scriptUrls = await Promise.all(
          Array.from({ length: scriptCount }).map((_, i) =>
            getResourceData(scripts, i, "src"),
          ),
        );

        // Gather stylesheets data
        const stylesheets = page.locator("link[rel='stylesheet'][href]");
        const styleCount = await stylesheets.count();
        const styleUrls = await Promise.all(
          Array.from({ length: styleCount }).map((_, i) =>
            getResourceData(stylesheets, i, "href"),
          ),
        );

        // Validate and archive issues functionally to satisfy Playwright lint
        const scriptErrors = scriptUrls
          .map((s) => validateIntegrity(url, s.url, s.integrity, "Script"))
          .filter((e): e is string => e !== null);
        issues.push(...scriptErrors);

        const styleErrors = styleUrls
          .map((s) => validateIntegrity(url, s.url, s.integrity, "Stylesheet"))
          .filter((e): e is string => e !== null);
        issues.push(...styleErrors);
      });
    }

    // ESLint still might complain about 'if' in loops.
    // Let's use a more functional approach to satisfy it.

    expect(
      issues,
      "All local scripts and stylesheets should have valid SRI integrity hashes",
    ).toEqual([]);
  });

  test("inline scripts have nonce for CSP compliance", async ({ page }) => {
    const urls = await getSitemapUrls();

    for (const url of urls) {
      await test.step(`Checking inline script nonces: ${url}`, async () => {
        await page.goto(url);

        const inlineScripts = page.locator("script:not([src])");
        const count = await inlineScripts.count();

        // Gather data first to avoid recursion/nesting depth issues
        const scriptData = await Promise.all(
          Array.from({ length: count }).map((_, i) =>
            getInlineScriptData(inlineScripts, i),
          ),
        );

        for (const data of scriptData) {
          expect(
            data.hasContent && !data.nonce ? "missing" : "ok",
            `[${url}] ${data.type} script missing nonce. Preview: "${data.content}..."`,
          ).toBe("ok");
        }
      });
    }
  });

  test("no elements have inline style attributes (CSP compliance)", async ({
    page,
  }) => {
    const urls = await getSitemapUrls();
    const elementsWithStyle: string[] = [];

    for (const url of urls) {
      await test.step(`Checking inline styles: ${url}`, async () => {
        await page.goto(url);

        // Exclude elements with allowed display values, SVG internals, and empty styles
        const locator = page.locator(
          '[style]:not([style=""]):not([style*="display: block"]):not([style*="display:block"]):not([style*="display: none"]):not([style*="display:none"]):not([id="preact-border-shadow-host"]):not(rect):not(g):not(path):not(line):not(text):not(polygon):not(circle):not(ellipse)',
        );

        const count = await locator.count();
        const elementData = await Promise.all(
          Array.from({ length: count }).map(async (_, i) => {
            const el = locator.nth(i);
            const [tagName, style] = await Promise.all([
              el.evaluate((node) => node.tagName.toLowerCase()),
              el.getAttribute("style"),
            ]);
            return { tagName, style };
          }),
        );

        // Filter out empty styles and add violations
        const violations = elementData
          .filter((data) => data.style && data.style.trim() !== "")
          .map((data) => `${url}: <${data.tagName} style="${data.style}">`);

        elementsWithStyle.push(...violations);
      });
    }

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
    expect(content).toMatch(/\$csp_script_\d+/);
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

    expect(cspPolicy).toContain("default-src 'none'");
    expect(cspPolicy).toContain("frame-src 'none'");
    expect(cspPolicy).toContain("object-src 'none'");
    expect(cspPolicy).toContain("frame-ancestors 'none'");
  });
});
