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

interface StaticData {
  staticPosts: {
    title: string;
    url: string;
    date: string;
    tags: string[];
    description: string;
  }[];
  staticPubs: {
    title: string;
    authors: string;
    year: string;
    venue: string;
    group: string;
  }[];
  staticSections: { title: string; type: string; summary: string }[];
  personName: string;
  staticTools: {
    name: string;
    description: string;
    url: string;
    category: string;
  }[];
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

  test("manifest has a reasonable number of tools", () => {
    // At minimum: 6 site + 3 blog + 2 CV + 2 pubs + 1 tools-index = 14 content tools
    // plus app-specific tools. Avoid hardcoding the exact count.
    expect(manifest.tools.length).toBeGreaterThanOrEqual(14);
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
      // Every page gets at least 14 tools: 6 site + 3 blog + 2 CV + 2 pubs + 1 tools-index
      expect(names.length).toBeGreaterThanOrEqual(14);
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
    // Must match the build-output manifest (no hardcoded count)
    const buildManifest = loadManifest();
    expect(body.tools).toHaveLength(buildManifest.tools.length);
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
    // Verify it mentions a tool count (any number), not a hardcoded value
    expect(text).toMatch(/\d+ tools/);
  });
});

// ─── All tools on all pages (static data) ──────────────────────────

test.describe("WebMCP — All content tools on every page", () => {
  /** All 14 content tools that should be on every page. */
  const allContentToolNames = [
    // Site-wide (6)
    "get-current-theme",
    "toggle-theme",
    "get-page-info",
    "get-site-navigation",
    "navigate-to",
    "switch-language",
    // Blog (3)
    "list-blog-posts",
    "search-blog-posts",
    "get-post-tags",
    // CV (2)
    "get-cv-summary",
    "get-cv-section",
    // Publications (2)
    "list-publications",
    "search-publications",
    // Tools index (1)
    "list-available-tools",
  ];

  const spotCheckUrls = ["/", "/blog/", "/cv", "/tools/", "/publications/"];

  for (const url of spotCheckUrls) {
    test(`${url} — has all 14 content tools`, async ({ page }) => {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const names = await getProviderToolNames(page);

      for (const toolName of allContentToolNames) {
        expect(names, `${url} missing tool "${toolName}"`).toContain(toolName);
      }
    });
  }
});

// ─── Static data attribute validation ───────────────────────────────

test.describe("WebMCP — Static data (data-webmcp-static)", () => {
  test("homepage has data-webmcp-static attribute with valid JSON", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const scriptEl = page.locator("script#webmcp-provider");
    await expect(scriptEl).toHaveAttribute("data-webmcp-static");

    const raw = await scriptEl.getAttribute("data-webmcp-static");
    const data = JSON.parse(raw ?? "{}") as StaticData;

    expect(data.staticPosts).toBeInstanceOf(Array);
    expect(data.staticPubs).toBeInstanceOf(Array);
    expect(data.staticSections).toBeInstanceOf(Array);
    expect(data.staticTools).toBeInstanceOf(Array);
    expect(typeof data.personName).toBe("string");
  });

  test("static data contains actual content (not empty)", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const raw = await page
      .locator("script#webmcp-provider")
      .getAttribute("data-webmcp-static");
    const data = JSON.parse(raw ?? "{}") as StaticData;

    expect(data.staticPosts.length).toBeGreaterThan(0);
    expect(data.staticPubs.length).toBeGreaterThan(0);
    expect(data.staticSections.length).toBeGreaterThan(0);
    expect(data.staticTools.length).toBeGreaterThan(0);
    expect(data.personName.length).toBeGreaterThan(0);
  });

  test("static posts have required fields", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const raw = await page
      .locator("script#webmcp-provider")
      .getAttribute("data-webmcp-static");
    const data = JSON.parse(raw ?? "{}") as StaticData;

    for (const post of data.staticPosts) {
      expect(post.title, "post missing title").toBeTruthy();
      expect(post.url, `${post.title} missing url`).toMatch(/^\/blog\//);
      expect(post.date, `${post.title} missing date`).toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      );
      expect(post.tags, `${post.title} missing tags`).toBeInstanceOf(Array);
    }
  });

  test("static tools have required fields", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const raw = await page
      .locator("script#webmcp-provider")
      .getAttribute("data-webmcp-static");
    const data = JSON.parse(raw ?? "{}") as StaticData;

    for (const tool of data.staticTools) {
      expect(tool.name, "tool missing name").toBeTruthy();
      expect(tool.url, `${tool.name} missing url`).toMatch(/^\/tools\//);
      expect(tool.category, `${tool.name} missing category`).toBeTruthy();
    }
  });

  test("static data is consistent across pages", async ({ page }) => {
    // Data should be identical on all pages since it's build-time static
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const homeEl = page.locator("script#webmcp-provider");
    await expect(homeEl).toHaveAttribute("data-webmcp-static");
    const homeRaw = await homeEl.getAttribute("data-webmcp-static");

    await page.goto("/blog/", { waitUntil: "domcontentloaded" });
    const blogEl = page.locator("script#webmcp-provider");
    await expect(blogEl).toHaveAttribute("data-webmcp-static", homeRaw!);
  });
});

// ─── Serialization smoke tests ──────────────────────────────────────

test.describe("WebMCP — Serialization integrity", () => {
  test("blog tool executeStr references staticPosts closure variable", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const raw = await page
      .locator("script#webmcp-provider")
      .getAttribute("data-webmcp-tools");
    const tools = JSON.parse(raw ?? "[]") as SerializedTool[];

    const listPosts = tools.find((t) => t.name === "list-blog-posts");
    expect(listPosts).toBeDefined();
    expect(listPosts!.executeStr).toContain("staticPosts");
  });

  test("CV tool executeStr references closure variables", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const raw = await page
      .locator("script#webmcp-provider")
      .getAttribute("data-webmcp-tools");
    const tools = JSON.parse(raw ?? "[]") as SerializedTool[];

    const cvSummary = tools.find((t) => t.name === "get-cv-summary");
    expect(cvSummary).toBeDefined();
    expect(cvSummary!.executeStr).toContain("personName");
    expect(cvSummary!.executeStr).toContain("staticSections");
  });

  test("publications tool executeStr references staticPubs", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const raw = await page
      .locator("script#webmcp-provider")
      .getAttribute("data-webmcp-tools");
    const tools = JSON.parse(raw ?? "[]") as SerializedTool[];

    const listPubs = tools.find((t) => t.name === "list-publications");
    expect(listPubs).toBeDefined();
    expect(listPubs!.executeStr).toContain("staticPubs");
  });

  test("every tool has a valid executeStr", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const raw = await page
      .locator("script#webmcp-provider")
      .getAttribute("data-webmcp-tools");
    const tools = JSON.parse(raw ?? "[]") as SerializedTool[];

    for (const tool of tools) {
      expect(tool.executeStr, `${tool.name} has empty executeStr`).toBeTruthy();
      // Every execute function should be a function expression or arrow
      expect(
        tool.executeStr.startsWith("(") ||
          tool.executeStr.startsWith("function") ||
          tool.executeStr.startsWith("async"),
        `${tool.name} executeStr doesn't look like a function: ${tool.executeStr.slice(0, 50)}`,
      ).toBe(true);
    }
  });
});
