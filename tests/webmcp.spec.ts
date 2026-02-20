/**
 * WebMCP Integration Tests
 *
 * Validates the WebMCP implementation across the site:
 * - Static manifest (.well-known/webmcp.json) structure and validity
 * - `<link rel="webmcp-manifest">` presence on all pages
 * - WebMCPProvider script injection on all pages
 * - Tool page JSON-LD featureList with WebMCP entries
 * - Cross-references between manifest, robots.txt, and llms.txt
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { getCachedPages } from "./utils";

const pages = getCachedPages();
const DIST_DIR = resolve(process.cwd(), "dist");

// ─── Types ───────────────────────────────────────────────────────────

interface WebMCPManifestTool {
  name: string;
  description: string;
  annotations?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  availableOn?: string | string[];
}

interface WebMCPManifest {
  version: string;
  name: string;
  description: string;
  url: string;
  spec: string;
  features: string[];
  tools: WebMCPManifestTool[];
}

interface SerializedTool {
  name: string;
  description: string;
  executeStr: string;
}

interface JsonLdNode {
  "@type"?: string;
  "@graph"?: JsonLdNode[];
  featureList?: string | string[];
  [key: string]: unknown;
}

/** Load and parse the manifest from the build output. */
function loadManifest(): WebMCPManifest {
  const raw = readFileSync(
    resolve(DIST_DIR, ".well-known/webmcp.json"),
    "utf-8",
  );
  return JSON.parse(raw) as WebMCPManifest;
}

/** Parse WebMCP tool names from a page's provider script element. */
async function getProviderToolNames(
  page: import("@playwright/test").Page,
): Promise<string[]> {
  const scriptEl = page.locator("script#webmcp-provider");
  await expect(scriptEl).toHaveAttribute("data-webmcp-tools");
  const dataAttr = await scriptEl.getAttribute("data-webmcp-tools");
  const tools = JSON.parse(dataAttr ?? "[]") as SerializedTool[];
  return tools.map((t) => t.name);
}

// ─── Build output tests (no browser needed) ─────────────────────────

test.describe("WebMCP — Manifest (build output)", () => {
  let manifest: WebMCPManifest;

  test.beforeAll(() => {
    manifest = loadManifest();
  });

  test("manifest has required top-level fields", () => {
    expect(manifest.version).toBeTruthy();
    expect(manifest.name).toBeTruthy();
    expect(manifest.description).toBeTruthy();
    expect(manifest.url).toMatch(/^https?:\/\//);
    expect(manifest.spec).toMatch(/^https?:\/\//);
    expect(manifest.features).toBeInstanceOf(Array);
    expect(manifest.features.length).toBeGreaterThan(0);
    expect(manifest.tools).toBeInstanceOf(Array);
  });

  test("manifest has 31 tools", () => {
    expect(manifest.tools).toHaveLength(31);
  });

  test("every tool has required fields", () => {
    for (const tool of manifest.tools) {
      expect(tool.name, `tool missing name`).toBeTruthy();
      expect(tool.description, `${tool.name} missing description`).toBeTruthy();
      expect(
        tool.annotations,
        `${tool.name} missing annotations`,
      ).toBeDefined();
      expect(
        tool.availableOn,
        `${tool.name} missing availableOn`,
      ).toBeDefined();
    }
  });

  test("tool names are unique", () => {
    const names = manifest.tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("tool names follow kebab-case convention", () => {
    for (const tool of manifest.tools) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
    }
  });

  test("tools with inputSchema have valid structure", () => {
    const toolsWithSchema = manifest.tools.filter(
      (t) => t.inputSchema && Object.keys(t.inputSchema).length > 0,
    );
    expect(toolsWithSchema.length).toBeGreaterThan(0);
    for (const tool of toolsWithSchema) {
      expect(tool.inputSchema?.type).toBe("object");
      expect(tool.inputSchema?.properties).toBeDefined();
    }
  });

  test("readOnlyHint annotation is a boolean on every tool", () => {
    for (const tool of manifest.tools) {
      expect(typeof tool.annotations?.readOnlyHint).toBe("boolean");
    }
  });

  test("manifest includes required WebMCP features", () => {
    const required = ["provideContext", "clearContext", "staticManifest"];
    for (const feature of required) {
      expect(manifest.features).toContain(feature);
    }
  });

  test("manifest availableOn paths point to valid site routes", () => {
    const knownPrefixes = [
      "/",
      "/blog/",
      "/es/blog/",
      "/cv",
      "/es/cv",
      "/publications",
      "/es/publications",
      "/tools/",
      "/es/tools/",
    ];

    // Collect all non-wildcard paths from all tools
    const allPaths: string[] = manifest.tools.flatMap((tool) => {
      const raw = tool.availableOn;
      return raw === "*" ? [] : [raw].flat().filter((v): v is string => !!v);
    });

    for (const p of allPaths) {
      const matchesKnown = knownPrefixes.some(
        (prefix) => p === prefix || p.startsWith(prefix),
      );
      expect(matchesKnown, `unknown path "${p}"`).toBe(true);
    }
  });
});

// ─── Per-page browser tests ─────────────────────────────────────────

test.describe("WebMCP — Per-page integration", () => {
  for (const pageInfo of pages) {
    test(`${pageInfo.name} — has webmcp-manifest link`, async ({ page }) => {
      await page.goto(pageInfo.url, { waitUntil: "domcontentloaded" });

      const linkEl = page.locator('link[rel="webmcp-manifest"]');
      await expect(linkEl).toHaveCount(1);
      await expect(linkEl).toHaveAttribute(
        "href",
        /\.well-known\/webmcp\.json/,
      );
    });

    test(`${pageInfo.name} — has WebMCPProvider script`, async ({ page }) => {
      await page.goto(pageInfo.url, { waitUntil: "domcontentloaded" });

      const scriptEl = page.locator("script#webmcp-provider");
      await expect(scriptEl).toHaveCount(1);
      await expect(scriptEl).toHaveAttribute("data-webmcp-tools");

      const names = await getProviderToolNames(page);
      // Every page gets at least the 6 site-wide tools
      expect(names.length).toBeGreaterThanOrEqual(6);
    });
  }
});

// ─── Manifest HTTP access ───────────────────────────────────────────

test.describe("WebMCP — Manifest HTTP", () => {
  test("/.well-known/webmcp.json is accessible and valid JSON", async ({
    request,
  }) => {
    const res = await request.get("/.well-known/webmcp.json");
    expect(res.status()).toBe(200);

    const contentType = res.headers()["content-type"] ?? "";
    expect(contentType).toContain("json");

    const body = (await res.json()) as WebMCPManifest;
    expect(body.version).toBeTruthy();
    expect(body.tools).toBeInstanceOf(Array);
    expect(body.tools).toHaveLength(31);
  });
});

// ─── Tool pages: JSON-LD featureList ────────────────────────────────

/** Extract WebMCP features from a JSON-LD script element. */
async function extractWebmcpFeatures(
  script: import("@playwright/test").Locator,
): Promise<string[]> {
  const text = await script.textContent();
  if (!text) return [];

  const data = JSON.parse(text) as JsonLdNode;
  const graph: JsonLdNode[] = data["@graph"] ?? [data];
  const result: string[] = [];

  for (const node of graph) {
    if (node["@type"] !== "SoftwareApplication") continue;
    if (!node.featureList) continue;

    const features =
      typeof node.featureList === "string"
        ? node.featureList.split(", ")
        : node.featureList;

    for (const f of features) {
      if (f.startsWith("WebMCP:")) result.push(f);
    }
  }
  return result;
}

test.describe("WebMCP — Tool page featureList", () => {
  const toolSlugs = [
    "hash-calculator",
    "base64-encoder",
    "subnet-calculator",
    "password-generator",
    "timestamp-converter",
    "regex-tester",
    "color-contrast-checker",
    "cron-builder",
    "csp-builder",
    "cert-inspector",
    "http-headers-analyzer",
    "modbus-frame-builder",
    "nginx-config-generator",
    "wireguard-config-generator",
    "webmcp-tester",
    "webmcp-analyzer",
  ];

  for (const slug of toolSlugs) {
    test(`/tools/${slug}/ — JSON-LD has WebMCP featureList`, async ({
      page,
    }) => {
      await page.goto(`/tools/${slug}/`, { waitUntil: "domcontentloaded" });

      const jsonLdScripts = await page
        .locator('script[type="application/ld+json"]')
        .all();
      expect(jsonLdScripts.length).toBeGreaterThan(0);

      const allFeatures: string[] = [];
      for (const script of jsonLdScripts) {
        const features = await extractWebmcpFeatures(script);
        allFeatures.push(...features);
      }

      expect(
        allFeatures.length,
        `${slug}: no WebMCP entries in featureList`,
      ).toBeGreaterThan(0);
    });
  }
});

// ─── Cross-reference: robots.txt and llms.txt ───────────────────────

test.describe("WebMCP — Cross-references", () => {
  test("robots.txt references webmcp.json", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain(".well-known/webmcp.json");
  });

  test("llms.txt mentions WebMCP", async ({ request }) => {
    const res = await request.get("/llms.txt");
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text.toLowerCase()).toContain("webmcp");
  });

  test("llms-full.txt mentions WebMCP with tool count", async ({ request }) => {
    const res = await request.get("/llms-full.txt");
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text.toLowerCase()).toContain("webmcp");
    expect(text).toContain("31 tools");
  });
});

// ─── Context-specific tool injection ────────────────────────────────

test.describe("WebMCP — Context-specific tools", () => {
  test("blog page includes blog tools", async ({ page }) => {
    await page.goto("/blog/", { waitUntil: "domcontentloaded" });
    const names = await getProviderToolNames(page);

    expect(names).toContain("list-blog-posts");
    expect(names).toContain("search-blog-posts");
    expect(names).toContain("get-post-tags");
  });

  test("CV page includes CV tools", async ({ page }) => {
    await page.goto("/cv", { waitUntil: "domcontentloaded" });
    const names = await getProviderToolNames(page);

    expect(names).toContain("get-cv-summary");
    expect(names).toContain("get-cv-section");
  });

  test("publications page includes publications tools", async ({ page }) => {
    await page.goto("/publications/", { waitUntil: "domcontentloaded" });
    const names = await getProviderToolNames(page);

    expect(names).toContain("list-publications");
    expect(names).toContain("search-publications");
  });

  test("tools index includes tools-index tools", async ({ page }) => {
    await page.goto("/tools/", { waitUntil: "domcontentloaded" });
    const names = await getProviderToolNames(page);

    expect(names).toContain("list-available-tools");
  });

  test("homepage has only site-wide tools (no contextual extras)", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const names = await getProviderToolNames(page);

    // Should include site-wide tools
    expect(names).toContain("get-current-theme");
    expect(names).toContain("get-page-info");

    // Should NOT include contextual tools
    expect(names).not.toContain("list-blog-posts");
    expect(names).not.toContain("get-cv-summary");
    expect(names).not.toContain("list-publications");
    expect(names).not.toContain("list-available-tools");
  });

  test("all pages include site-wide tools", async ({ page }) => {
    const spotCheckUrls = ["/", "/blog/", "/cv", "/tools/"];
    const siteToolNames = [
      "get-current-theme",
      "toggle-theme",
      "get-page-info",
      "get-site-navigation",
      "navigate-to",
      "switch-language",
    ];

    for (const url of spotCheckUrls) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const names = await getProviderToolNames(page);

      for (const toolName of siteToolNames) {
        expect(names, `${url} missing site-wide tool "${toolName}"`).toContain(
          toolName,
        );
      }
    }
  });
});
