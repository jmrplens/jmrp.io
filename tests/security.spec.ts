/**
 * Security Test Suite (CSP, SRI, Headers)
 *
 * Verifies the implementation of security best practices:
 * 1. Content Security Policy (CSP): Ensuring all scripts and styles have nonces.
 * 2. Subresource Integrity (SRI): Validating hashes for local external resources.
 * 3. Security Headers: Verifying the generation of `security_headers.conf` with
 *    HSTS, X-Frame-Options, and robust CSP directives. That file is no longer
 *    part of the build output — see `readHeadersConf()` for where it lives now
 *    and why a missing one fails the suite instead of skipping it.
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

import { stagingCandidates } from "../scripts/nginx-staging.mjs";
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

/**
 * Directories where the generated `security_headers.conf` can live.
 *
 * It is no longer part of the build output. The post-build hook writes it to
 * the staging directory and `scripts/deploy-live.mjs` MOVES it — after the
 * blue/green swap — into the Nginx snippets directory, so at any moment it
 * exists in exactly one of two places:
 *
 * 1. Staged (`POSTBUILD_NGINX_STAGING_DIR`, else the production or fallback root): a build ran
 *    and nothing delivered it — a worktree or a scratch build, where
 *    deploy-live is skipped because cwd is not the production root, so
 *    staging stays full. CI reaches this branch ONLY if the workspace running
 *    this suite has the staging directory: the build there happens in a
 *    separate job, and `functional-tests` restores just the `dist-build`
 *    artifact, so the staging directory has to be uploaded and downloaded
 *    alongside it (.github/workflows/ci.yml) or these three tests fail with
 *    the error below.
 * 2. Delivered (`POSTBUILD_NGINX_SNIPPETS_DIR`): production after a successful
 *    deploy, where the move emptied staging. The stronger of the two: it is
 *    the exact file Nginx loaded.
 *
 * Staged wins when both exist — it is the output of the most recent build,
 * while a delivered copy can predate it by a failed deploy.
 */
// `|| ""` then a trim, not `??`: both producers (post-build.ts's
// resolveNginxStagingDir and deploy-live.mjs's STAGING_DIR) treat an empty
// value as "unset" and fall back to `.nginx-staged`. `??` would not — an
// exported `POSTBUILD_NGINX_STAGING_DIR=`, this repo's documented way to opt a
// worktree out of an action, would point this resolver at the repo root while
// the build still wrote to `.nginx-staged`, and the fall-through to the
// delivered copy would then verify a file this build never produced.
const DELIVERED_SNIPPETS_DIR = (
  process.env.POSTBUILD_NGINX_SNIPPETS_DIR || ""
).trim();

/**
 * Reads the generated `security_headers.conf` from wherever it currently is.
 *
 * Absent from both locations is a FAILURE, never a skip. These three tests are
 * the only automated check on the CSP the site ships; a resolver that skipped
 * when it could not find the file would turn them into decoration that reports
 * green forever — the exact failure mode this suite exists to catch.
 *
 * @returns Resolved path and file contents.
 * @throws If the file is in neither location, or is empty.
 */
function readHeadersConf(): { path: string; content: string } {
  const staged = stagingCandidates().map((dir) =>
    path.join(dir, "security_headers.conf"),
  );
  const delivered = DELIVERED_SNIPPETS_DIR
    ? path.join(DELIVERED_SNIPPETS_DIR, "security_headers.conf")
    : "";

  const found = [...staged, delivered].find(
    (candidate) => candidate !== "" && fs.existsSync(candidate),
  );

  if (!found) {
    throw new Error(
      [
        "security_headers.conf not found, so the shipped CSP is unverified.",
        "The post-build hook writes it to the staging dir and deploy-live.mjs",
        "moves it to the Nginx snippets dir; it is never written to dist/.",
        ...staged.map((c) => `  staged (checked first): ${c} — missing`),
        delivered
          ? `  delivered:              ${delivered} — missing`
          : "  delivered:              POSTBUILD_NGINX_SNIPPETS_DIR unset" +
            " (playwright.config.ts loads .env when present)",
        "Run a build, or point POSTBUILD_NGINX_SNIPPETS_DIR at the delivered",
        "copy. This check never skips: an unverified CSP is a failure.",
      ].join("\n"),
    );
  }

  const content = fs.readFileSync(found, "utf-8");
  if (content.trim() === "") {
    throw new Error(`${found} exists but is empty — the build wrote nothing.`);
  }

  return { path: found, content };
}

test.describe("Build Output Verification", () => {
  test("security_headers.conf is generated by the build", () => {
    const { path: headersPath, content } = readHeadersConf();

    expect(content, `Checked ${headersPath}`).toContain(
      "Content-Security-Policy",
    );
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
    const { path: headersPath, content } = readHeadersConf();

    // Extract the CSP line using optimized RegExp.exec()
    const cspRegex = /Content-Security-Policy "([^"]+)"/;
    const cspMatch = cspRegex.exec(content);
    expect(
      cspMatch,
      `CSP header should be present in ${headersPath}`,
    ).toBeTruthy();

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
    const { path: headersPath, content } = readHeadersConf();

    // Both were pinned to the constant 1 with no session or preference
    // behind them: dead overhead on every HTML response.
    expect(content, `Checked ${headersPath}`).not.toContain("__Host-Session");
    expect(content).not.toContain("__Secure-Pref");
  });
});
