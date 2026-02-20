# WebMCP Implementation — jmrp.io

> **Status**: Experimental (`feat/webmcp` branch)
> **Version**: 0.2.0
> **Spec**: [WebMCP — Model Context Protocol for the Web](https://webmachinelearning.github.io/webmcp/) (W3C Draft, February 12, 2026)
> **Explainer**: [webmachinelearning/webmcp](https://github.com/webmachinelearning/webmcp)

---

## Table of Contents

- [What is WebMCP?](#what-is-webmcp)
- [Spec Summary](#spec-summary)
- [Implementation Overview](#implementation-overview)
- [Architecture](#architecture)
- [Spec Compliance Detail](#spec-compliance-detail)
- [Tool Catalog (30 tools)](#tool-catalog-30-tools)
- [Discovery Mechanisms](#discovery-mechanisms)
- [View Transitions Lifecycle](#view-transitions-lifecycle)
- [User Interaction Pattern](#user-interaction-pattern)
- [Security Considerations](#security-considerations)
- [File Reference](#file-reference)
- [Testing](#testing)
- [Ecosystem Survey](#ecosystem-survey)
- [Browser Compatibility](#browser-compatibility)
- [Removal Instructions](#removal-instructions)
- [Changelog](#changelog)
- [References](#references)

---

## What is WebMCP?

WebMCP (Model Context Protocol for the Web) is a **W3C Web Machine Learning Community Group proposal** that extends the browser with a `navigator.modelContext` API. It allows websites to expose their functionality as structured **tools** that browser-based AI agents can discover and invoke.

Think of it as a standard interface between websites and AI assistants built into the browser — the web equivalent of [MCP (Model Context Protocol)](https://modelcontextprotocol.io) for server-side AI tools.

### Why it matters

Without WebMCP, AI agents interacting with web pages must:

1. Parse and understand arbitrary DOM structures
2. Guess which buttons to click or inputs to fill
3. Use fragile screen-scraping heuristics

With WebMCP, websites **declaratively expose** what actions are available, what inputs they expect, and what they return — making agent interactions reliable, secure (user-controlled), and performant.

---

## Spec Summary

The WebMCP spec (Editor's Draft, February 12, 2026) defines a small, focused API on `navigator.modelContext`:

### IDL (Web IDL)

```text
[Exposed=Window]
interface ModelContext : EventTarget {
  undefined provideContext(optional ModelContextOptions options = {});
  undefined clearContext();
  undefined registerTool(ModelContextTool tool);
  undefined unregisterTool(DOMString name);
};

dictionary ModelContextOptions {
  sequence<ModelContextTool> tools;
};

dictionary ModelContextTool {
  required DOMString name;
  required DOMString description;
  object inputSchema;
  required ToolExecuteCallback execute;
  ModelContextToolAnnotations annotations;
};

dictionary ModelContextToolAnnotations {
  boolean readOnlyHint = true;
};

callback ToolExecuteCallback = Promise<any> (object input, ModelContextClient client);

[Exposed=Window]
interface ModelContextClient {
  Promise<any> requestUserInteraction(ModelContextInteractionCallback callback);
};

callback ModelContextInteractionCallback = Promise<any> ();
```

### Key API Methods

| Method                      | Purpose                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `provideContext({ tools })` | Registers tools, replacing any previous set. Idempotent — safe to call on every navigation. |
| `registerTool(tool)`        | Adds a single tool without clearing existing ones. Throws if the name already exists.       |
| `unregisterTool(name)`      | Removes a single tool by name.                                                              |
| `clearContext()`            | Unregisters all tools.                                                                      |

### Key Concepts

- **Tools**: Functions that AI agents can call. Each has a unique name, natural language description, JSON Schema for inputs, and an execute callback.
- **Annotations**: Metadata like `readOnlyHint` (default: `true`) indicates whether a tool modifies page state. Agents may use this to parallelize read-only calls.
- **Client**: The second parameter to `execute`. Provides `requestUserInteraction(callback)` for tools that need user confirmation (e.g., navigation, purchases, destructive actions).
- **Execute return format**: The spec allows `Promise<any>`, but the emerging convention (from MCP) is to return `{ content: [{ type: "text", text: "..." }] }`.

### Spec Scope and Non-Goals

The spec explicitly states:

> **Non-Goal**: "Enable / influence discoverability of sites to agents"

Discovery is **out of scope** — the spec only covers the JavaScript API for tool registration and execution once an agent is already on a page. Mechanisms like `.well-known/webmcp.json` manifests or `<link rel="webmcp-manifest">` tags are **custom extensions** not defined by the spec. The spec acknowledges:

> "A future iteration of this feature could introduce declarative tools definitions that are placed in an app manifest."

### Spec vs. Implementation Terminology

| Spec Term                     | Our Type Name               | Notes                              |
| ----------------------------- | --------------------------- | ---------------------------------- |
| `ModelContext`                | `WebMCPModelContext`        | Prefixed to avoid global conflicts |
| `ModelContextTool`            | `WebMCPTool`                |                                    |
| `ModelContextClient`          | `WebMCPClient`              |                                    |
| `ToolExecuteCallback`         | `WebMCPToolExecuteCallback` |                                    |
| `ModelContextToolAnnotations` | `WebMCPToolAnnotations`     |                                    |

---

## Implementation Overview

This site implements the **full WebMCP spec** as progressive enhancement:

- **Zero npm dependencies** — pure vanilla JS/TypeScript
- **Non-structural changes** — designed for easy removal
- **Feature detection everywhere** — completely inert if `navigator.modelContext` doesn't exist
- **30 registered tools** across all page contexts
- **First known implementation** of `requestUserInteraction()` and SPA lifecycle management (`clearContext()` on View Transitions)

### Implemented Spec Features

| Spec Feature                | Status  | Notes                                             |
| --------------------------- | ------- | ------------------------------------------------- |
| `provideContext()`          | ✅ Full | Used by WebMCPProvider for page-context tools     |
| `registerTool()`            | ✅ Full | Used by each app component for its specific tool  |
| `unregisterTool()`          | ✅ Full | Available via wrapper, used by tester             |
| `clearContext()`            | ✅ Full | Called on `astro:before-swap` View Transitions    |
| `inputSchema` (JSON Schema) | ✅ Full | All tools with parameters define complete schemas |
| `annotations.readOnlyHint`  | ✅ Full | Every tool explicitly annotated (`true`/`false`)  |
| `requestUserInteraction()`  | ✅ Full | Used by `navigate-to` and `switch-language`       |
| `execute(input, client)`    | ✅ Full | All 30 tools implement the execute callback       |

### Custom Extensions (beyond spec)

| Extension                             | Purpose                                        |
| ------------------------------------- | ---------------------------------------------- |
| `.well-known/webmcp.json` manifest    | Static tool discovery without JavaScript       |
| `<link rel="webmcp-manifest">`        | HTML-based manifest discovery                  |
| `availableOn` field in manifest       | Maps tools to specific page paths              |
| MCP content format responses          | `{ content: [{ type: "text", text: "..." }] }` |
| `specDate` and `features` in manifest | Machine-readable capability declaration        |

### Design Principles

1. **Progressive enhancement**: All WebMCP code is guarded by feature detection. If no browser supports the API, the code simply doesn't execute — zero console output, zero performance impact.
2. **Easy removal**: New files are self-contained; modifications to existing files are minimal and marked with `// === WebMCP START/END ===` comments.
3. **Zero dependencies**: Everything is implemented in vanilla TypeScript/JavaScript with no external libraries.
4. **Privacy-first**: All tool execution happens client-side in the browser. No data leaves the page.
5. **Graceful degradation**: `requestUserInteraction` uses try/catch — if the browser doesn't support it or the call fails, tools proceed without confirmation.

---

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      Build Time (Astro SSG)                     │
│                                                                 │
│  webmcp-tools.ts ──→ WebMCPProvider.astro ──→ HTML output       │
│  (tool definitions)   (serializes tools)     (data attribute)   │
│                                                                 │
│  App components ──→ Inline <script> blocks ──→ HTML output      │
│  (tool definitions)  (WebMCP registration)                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Runtime (Browser)                             │
│                                                                 │
│  1. Check: navigator.modelContext exists?                        │
│     └─ No → do nothing (inert)                                  │
│     └─ Yes → continue                                           │
│                                                                 │
│  2. WebMCPProvider script reads data-webmcp-tools attribute     │
│     └─ Reconstructs execute functions via dynamic <script>      │
│     └─ Calls navigator.modelContext.provideContext({ tools })   │
│                                                                 │
│  3. Each app component's WebMCP block runs                      │
│     └─ Calls navigator.modelContext.registerTool(appTool)       │
│                                                                 │
│  4. View Transitions: astro:before-swap → clearContext()        │
│     └─ Clears stale tools before DOM swap                       │
│     └─ After swap, steps 2-3 re-run for new page               │
│                                                                 │
│  5. AI agent discovers tools and invokes them                   │
│     └─ tool.execute(input, client) → { content: [...] }        │
│     └─ Mutating tools use client.requestUserInteraction()       │
└─────────────────────────────────────────────────────────────────┘
```

### Function Serialization

Astro's `define:vars` cannot serialize JavaScript functions. The solution:

1. **Server-side**: `tool.execute.toString()` converts each function to a source string
2. **Transport**: Serialized as JSON in a `data-webmcp-tools` attribute on the provider `<script>` tag
3. **Client-side**: Dynamic `<script>` element injection reconstructs the callable function

```javascript
// For each tool, a dynamic <script> is created:
var sc = document.createElement("script");
sc.textContent =
  'window["' + ns + '"]["f' + i + '"] = ' + d[i].executeStr + ";";
document.head.appendChild(sc);
document.head.removeChild(sc);
```

This is **CSP-compatible** because the dynamic `<script>` elements inherit trust from the nonce'd parent script via `strict-dynamic`. The ephemeral scripts are immediately removed from the DOM after execution.

**Critical constraint**: Tool `execute` functions **must be self-contained** — they cannot reference closures, imports, or server-side variables. All helpers (like `inputStr`) must be defined inside the function body.

### Async Execute Support

The `execute` callback supports both synchronous and asynchronous functions. Tools like `navigate-to` and `switch-language` use `async` because they await `requestUserInteraction()`. Tools like `list-available-tools` use `async` because they `fetch()` the manifest. The serialization via `.toString()` preserves `async` correctly:

```javascript
// Serialized output in HTML:
async (input, client) => {
  // ...
  const confirmed = await client.requestUserInteraction(async () => {
    return confirm("Navigate to " + target.pathname + "?");
  });
};
```

### Tool Registration Strategy

| Context                         | Method             | Location                                  |
| ------------------------------- | ------------------ | ----------------------------------------- |
| Site-wide tools (6)             | `provideContext()` | WebMCPProvider.astro                      |
| Blog tools (3)                  | `provideContext()` | WebMCPProvider.astro (path-conditional)   |
| CV tools (2)                    | `provideContext()` | WebMCPProvider.astro (path-conditional)   |
| Publications tools (2)          | `provideContext()` | WebMCPProvider.astro (path-conditional)   |
| Tools-index tools (1)           | `provideContext()` | WebMCPProvider.astro (path-conditional)   |
| App tools (15 files → 16 tools) | `registerTool()`   | Each app component's `<script is:inline>` |

The provider uses `provideContext()` (which replaces all tools) for the base set, then each app component uses `registerTool()` (which adds without replacing) for its specific tool(s). This two-phase approach ensures:

- Base tools are always available on every page
- App-specific tools only appear on their respective pages
- No naming conflicts (`provideContext` runs first, `registerTool` adds after)

---

## Spec Compliance Detail

### `provideContext()` — Full compliance

Per spec: "Replaces any tools previously provided." Our implementation calls it exactly once per page load from WebMCPProvider with the full set of page-appropriate tools. On View Transitions, `clearContext()` runs before swap, then `provideContext()` re-runs in the new page.

### `registerTool()` — Full compliance

Per spec: "Throws if a tool with the same name already exists." Each app component registers its tool(s) after the provider has already set the base tools. Since base tool names never overlap with app tool names, no conflicts occur.

### `clearContext()` — Full compliance

Per spec: "Unregisters all tools." Called proactively on `astro:before-swap` to prevent stale tools from persisting during Astro View Transitions page swaps. This is a lifecycle concern unique to SPAs — the spec doesn't address SPA navigation because it focuses on individual page contexts.

### `annotations.readOnlyHint` — Full compliance

Per spec: "Default value is `true`." Every tool in our catalog explicitly sets this annotation:

- **20 read-only tools**: `readOnlyHint: true` (hash, encode, decode, subnet, list, search, etc.)
- **3 mutating tools**: `readOnlyHint: false` (`toggle-theme`, `navigate-to`, `switch-language`)
- **7 read-only app tools**: `readOnlyHint: true` (generate password, nginx config, etc.)

### `requestUserInteraction()` — Full compliance

Per spec: "Asynchronously requests user input during tool execution. The callback is invoked to perform user interaction." Our implementation:

- Used by `navigate-to` (asks "Navigate to /path?") and `switch-language` (asks "Switch language to Spanish/English?")
- Uses `confirm()` as the interaction mechanism (per the spec's own example pattern)
- Graceful degradation: if `client` is undefined or `requestUserInteraction` throws, the tool proceeds without confirmation
- Not used by `toggle-theme` because it's non-destructive and easily reversible

### `inputSchema` — Full compliance

All tools with parameters define JSON Schema objects with:

- `type: "object"` at the root
- `properties` with typed entries and descriptions
- `required` arrays where applicable
- `enum` constraints where applicable (e.g., hash algorithms, locale codes)

---

## Tool Catalog (30 tools)

### Site-Wide Tools (available on every page)

| Tool                  | Description                                          | Mutating | `requestUserInteraction` |
| --------------------- | ---------------------------------------------------- | -------- | ------------------------ |
| `get-current-theme`   | Returns current theme (`dark`/`light`)               | No       | —                        |
| `toggle-theme`        | Switches between dark and light theme                | Yes      | No (reversible)          |
| `get-page-info`       | Returns page title, URL, description, locale, type   | No       | —                        |
| `get-site-navigation` | Returns all navigation links from header             | No       | —                        |
| `navigate-to`         | Navigates to a specified URL path (same-origin only) | Yes      | **Yes**                  |
| `switch-language`     | Switches between English and Spanish                 | Yes      | **Yes**                  |

### Blog Tools (available on `/blog/*`)

| Tool                | Description                                                          | Mutating |
| ------------------- | -------------------------------------------------------------------- | -------- |
| `list-blog-posts`   | Lists all posts on the page with title, URL, date, tags, description | No       |
| `search-blog-posts` | Searches posts by keyword in title/description                       | No       |
| `get-post-tags`     | Gets all unique tags on the page                                     | No       |

### CV Tools (available on `/cv`)

| Tool             | Description                                              | Mutating |
| ---------------- | -------------------------------------------------------- | -------- |
| `get-cv-summary` | Returns profile name and section headings                | No       |
| `get-cv-section` | Returns content of a specific CV section by heading name | No       |

### Publications Tools (available on `/publications`)

| Tool                  | Description                                                      | Mutating |
| --------------------- | ---------------------------------------------------------------- | -------- |
| `list-publications`   | Lists all academic publications with title, authors, year, venue | No       |
| `search-publications` | Searches publications by keyword                                 | No       |

### Tools Index Tool (available on `/tools/*`)

| Tool                   | Description                                       | Mutating |
| ---------------------- | ------------------------------------------------- | -------- |
| `list-available-tools` | Lists all tools from manifest (with DOM fallback) | No       |

### App-Specific Tools (available on individual tool pages)

| Tool                        | Page                                 | Description                                 |
| --------------------------- | ------------------------------------ | ------------------------------------------- |
| `calculate-hash`            | `/tools/hash-calculator/`            | Compute SHA-256/384/512 hashes              |
| `encode-base64`             | `/tools/base64-encoder/`             | Encode text to Base64                       |
| `decode-base64`             | `/tools/base64-encoder/`             | Decode Base64 to text                       |
| `calculate-subnet`          | `/tools/subnet-calculator/`          | Calculate IPv4 subnet info                  |
| `generate-password`         | `/tools/password-generator/`         | Generate cryptographically secure passwords |
| `convert-timestamp`         | `/tools/timestamp-converter/`        | Convert Unix timestamps / ISO 8601          |
| `test-regex`                | `/tools/regex-tester/`               | Test regular expressions with matches       |
| `check-color-contrast`      | `/tools/color-contrast-checker/`     | Check WCAG 2.1 contrast ratios              |
| `parse-cron`                | `/tools/cron-builder/`               | Parse cron expressions to human-readable    |
| `build-csp`                 | `/tools/csp-builder/`                | Generate CSP header strings                 |
| `inspect-certificate`       | `/tools/cert-inspector/`             | Parse PEM X.509 certificates                |
| `analyze-headers`           | `/tools/http-headers-analyzer/`      | Analyze HTTP security headers               |
| `build-modbus-frame`        | `/tools/modbus-frame-builder/`       | Build Modbus RTU frames with CRC-16         |
| `generate-nginx-config`     | `/tools/nginx-config-generator/`     | Generate Nginx server blocks                |
| `generate-wireguard-config` | `/tools/wireguard-config-generator/` | Generate WireGuard VPN configs              |
| `webmcp-tester`             | `/tools/webmcp-tester/`              | Interactive WebMCP API testing              |

---

## Discovery Mechanisms

### 1. Link Tag (HTML) — Custom extension

Every page includes a `<link>` tag pointing to the manifest:

```html
<link
  rel="webmcp-manifest"
  href="/.well-known/webmcp.json"
  type="application/json"
/>
```

> **Note**: `rel="webmcp-manifest"` is NOT defined by the spec. It is a forward-looking extension inspired by the spec's acknowledgment that "a future iteration could introduce declarative tools definitions in an app manifest."

### 2. Well-Known Manifest (JSON) — Custom extension

The static manifest at `/.well-known/webmcp.json` provides tool discovery without JavaScript execution:

```json
{
  "version": "0.2.0",
  "name": "jmrp.io",
  "description": "Personal technical blog and portfolio...",
  "url": "https://jmrp.io",
  "spec": "https://webmachinelearning.github.io/webmcp/",
  "specDate": "2026-02-12",
  "features": [
    "provideContext",
    "registerTool",
    "clearContext",
    "requestUserInteraction",
    "viewTransitionLifecycle",
    "staticManifest"
  ],
  "tools": [
    {
      "name": "toggle-theme",
      "description": "Toggle the site color theme...",
      "annotations": { "readOnlyHint": false },
      "availableOn": "*"
    },
    {
      "name": "calculate-hash",
      "description": "Calculate SHA-256, SHA-384, and SHA-512 hashes...",
      "inputSchema": { "type": "object", "properties": { ... }, "required": ["text"] },
      "annotations": { "readOnlyHint": true },
      "availableOn": "/tools/hash-calculator/"
    }
  ]
}
```

Manifest fields:

| Field                 | Purpose                                                       |
| --------------------- | ------------------------------------------------------------- |
| `version`             | Manifest format version (currently `0.2.0`)                   |
| `name`                | Human-readable site name                                      |
| `description`         | Site description                                              |
| `url`                 | Canonical URL                                                 |
| `spec`                | URL of the WebMCP spec being implemented                      |
| `specDate`            | Date of the spec edition being followed                       |
| `features`            | Array of implemented spec features (machine-readable)         |
| `tools[]`             | Each tool with name, description, inputSchema, annotations    |
| `tools[].availableOn` | Page path(s) where the tool is registered (`"*"` = site-wide) |

### 3. LLM Context Files

Both `public/llms.txt` and `public/llms-full.txt` include a WebMCP section describing the API availability, following the [llmstxt.org](https://llmstxt.org) standard.

---

## View Transitions Lifecycle

Astro uses [View Transitions](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API) for page navigation in SPA mode. This creates a lifecycle challenge for WebMCP: when the user navigates between pages, the old page's tools must be cleaned up before the new page's tools are registered.

### The Problem

Without lifecycle management:

1. User is on `/tools/hash-calculator/` → 7 tools registered (6 site + `calculate-hash`)
2. User navigates to `/blog/` → Astro swaps the DOM
3. WebMCPProvider re-runs → calls `provideContext()` with 9 tools (6 site + 3 blog)
4. But `calculate-hash` was added via `registerTool()` in step 1 — if the browser doesn't fully reset on `provideContext()`, a stale tool could persist

### The Solution

```javascript
// In WebMCPProvider's inline script:
if (!window._wmcpTransitionHandlerSet) {
  document.addEventListener("astro:before-swap", function () {
    if (
      navigator.modelContext &&
      typeof navigator.modelContext.clearContext === "function"
    ) {
      navigator.modelContext.clearContext();
    }
  });
  window._wmcpTransitionHandlerSet = true;
}
```

Timeline:

1. `astro:before-swap` fires → `clearContext()` removes ALL tools (clean slate)
2. Astro swaps the DOM
3. `astro:after-swap` fires (implicit: scripts re-execute)
4. WebMCPProvider re-runs → `provideContext()` registers new page's tools
5. App component scripts re-run → `registerTool()` adds page-specific tools

The `_wmcpTransitionHandlerSet` guard follows the same pattern used by the theme handler in `BaseLayout.astro` (`window.themeHandlersSet`) to prevent duplicate event listeners across navigations.

---

## User Interaction Pattern

The spec defines `ModelContextClient.requestUserInteraction()` as the mechanism for tools to request user confirmation during execution. This is critical for **destructive or disruptive actions** where an agent should not act autonomously.

### Implementation Pattern

```typescript
execute: async (input: Record<string, unknown>, client?: WebMCPClient) => {
  // ... validate input ...

  // Request confirmation if the browser supports it
  if (client && typeof client.requestUserInteraction === "function") {
    try {
      const confirmed = await client.requestUserInteraction(async () => {
        return confirm("Navigate to " + target.pathname + "?");
      });
      if (!confirmed) {
        return {
          content: [{ type: "text", text: "Navigation cancelled by user." }],
        };
      }
    } catch {
      // Graceful degradation: proceed without confirmation
    }
  }

  // Perform the action
  globalThis.location.href = target.href;
  return {
    content: [{ type: "text", text: `Navigating to ${target.pathname}` }],
  };
};
```

### Design Decisions

| Tool                | Uses `requestUserInteraction`? | Rationale                                                |
| ------------------- | ------------------------------ | -------------------------------------------------------- |
| `navigate-to`       | **Yes**                        | Causes page navigation — user loses current page context |
| `switch-language`   | **Yes**                        | Causes page reload in different locale — disruptive      |
| `toggle-theme`      | No                             | Non-destructive, instantly reversible, no page reload    |
| All read-only tools | No                             | Read-only tools don't modify state                       |

### Graceful Degradation

The implementation handles three scenarios:

1. **Browser supports `requestUserInteraction`**: Confirmation dialog shown → user approves or cancels
2. **Browser doesn't provide `client`**: `client` is `undefined` → tool proceeds without confirmation
3. **`requestUserInteraction` throws**: Caught by try/catch → tool proceeds without confirmation

This ensures tools always work, regardless of browser support level.

### Spec Alignment

The pattern follows the spec's own example from the proposal document:

```javascript
// From the WebMCP proposal (buyProduct example):
const confirmed = await agent.requestUserInteraction(async () => {
  return new Promise((resolve) => {
    const confirmed = confirm(`Buy product ${product_id}?`);
    resolve(confirmed);
  });
});
```

Our implementation uses the same `confirm()` approach but with a simpler `async () => confirm(...)` shorthand, since `confirm()` already returns synchronously and the `async` wrapper satisfies the callback type.

---

## Security Considerations

### Content Security Policy (CSP)

The site uses a **nonce-only CSP** strategy with `strict-dynamic`. WebMCP is compatible because:

1. The WebMCPProvider `<script is:inline>` tag receives a nonce at build time
2. Dynamic `<script>` elements created by the provider inherit trust via `strict-dynamic`
3. App component WebMCP blocks are inside `<script is:inline>` tags that also receive nonces
4. No `eval()` or `new Function()` is used anywhere — function reconstruction is pure script injection

### Same-Origin Navigation

The `navigate-to` tool enforces same-origin navigation:

```javascript
const target = new URL(path, globalThis.location.origin);
if (target.origin !== globalThis.location.origin) {
  return {
    content: [
      {
        type: "text",
        text: "Error: Cross-origin navigation is not allowed.",
      },
    ],
  };
}
```

### No External Data Transmission

All tool execution is client-side only. Tools that compute results (hashing, encoding, subnet calculation) never send data to any server. The only network request is the optional `fetch("/.well-known/webmcp.json")` in `list-available-tools`, which is a same-origin request.

### User Confirmation for State Changes

Mutating tools (`navigate-to`, `switch-language`) use `requestUserInteraction()` to get user confirmation before acting, preventing AI agents from silently navigating users without consent.

---

## File Reference

### New Files (all removable)

| File                                         | Lines | Purpose                                                                                                                                          |
| -------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/types/webmcp.ts`                        | ~210  | TypeScript interfaces: `WebMCPTool`, `WebMCPClient`, `WebMCPToolExecuteCallback`, `WebMCPModelContext`, `WebMCPManifest`, Navigator augmentation |
| `src/utils/webmcp.ts`                        | ~101  | Safe wrapper functions: `isWebMCPSupported()`, `provideContext()`, `registerTool()`, `unregisterTool()`, `clearContext()`, `registerTools()`     |
| `src/utils/webmcp-tools.ts`                  | ~610  | Tool catalog: `getSiteTools()`, `getBlogTools()`, `getCVTools()`, `getPublicationsTools()`, `getToolsIndexTools()`                               |
| `src/components/layout/WebMCPProvider.astro` | ~133  | Astro component: serializes tools, injects client-side registration script, View Transitions lifecycle handler                                   |
| `src/components/apps/WebMCPTester.astro`     | ~1182 | Interactive testing tool: polyfills API, lists tools, executes them, views manifest                                                              |
| `public/.well-known/webmcp.json`             | ~648  | Static manifest: 30 tool definitions with schemas, `availableOn` paths, and feature list                                                         |
| `src/content/tools/en/webmcp-tester.mdx`     | ~80   | Tool documentation (English)                                                                                                                     |
| `src/content/tools/es/webmcp-tester.mdx`     | ~80   | Tool documentation (Spanish)                                                                                                                     |
| `docs/WEBMCP.md`                             | —     | This file                                                                                                                                        |

### Modified Files (minimal changes)

| File                                     | Change                                       | Lines       |
| ---------------------------------------- | -------------------------------------------- | ----------- |
| `src/layouts/BaseLayout.astro`           | Import + `<WebMCPProvider />`                | +3          |
| `src/components/layout/BaseHead.astro`   | `<link rel="webmcp-manifest">`               | +1          |
| `src/components/pages/ToolPage.astro`    | Import + componentMap entry for WebMCPTester | +2          |
| `src/components/apps/*.astro` (15 files) | WebMCP registration blocks in inline scripts | +20-60 each |
| `src/i18n/translations/en/tools.ts`      | `webmcpTester` translation keys              | +35         |
| `src/i18n/translations/es/tools.ts`      | `webmcpTester` translation keys              | +35         |
| `public/llms.txt`                        | WebMCP section                               | +5          |
| `public/llms-full.txt`                   | WebMCP bullet                                | +1          |
| `cspell-project-words.txt`               | "webmcp"                                     | +1          |
| `CLAUDE.md`                              | WebMCP documentation section                 | +55         |

---

## Testing

### WebMCP Tester Tool

The site includes a built-in testing tool at `/tools/webmcp-tester/` (~1182 lines) that:

1. **Polyfills** `navigator.modelContext` with a simulation that captures tool registrations
2. **Re-executes** the WebMCPProvider script and all app component WebMCP blocks
3. **Lists** all discovered tools with their schemas and annotations
4. **Executes** tools with user-provided inputs and displays results (including async tools)
5. **Inspects** the `.well-known/webmcp.json` manifest for consistency

The tester page receives **ALL tool categories** (not just site-wide) so users can test every tool type from a single page, including blog tools, CV tools, publications tools, and tools-index tools.

### Manual Testing via DevTools

You can test the API directly in the browser console:

```javascript
// 1. Create the polyfill
const tools = [];
navigator.modelContext = {
  provideContext: (opts) => {
    tools.length = 0; // clear previous (per spec)
    tools.push(...(opts.tools || []));
    console.log("Registered:", tools.length, "tools");
  },
  registerTool: (t) => {
    tools.push(t);
    console.log("Registered:", t.name);
  },
  unregisterTool: (name) => {
    const i = tools.findIndex((t) => t.name === name);
    if (i >= 0) tools.splice(i, 1);
  },
  clearContext: () => {
    tools.length = 0;
  },
};

// 2. Re-run the provider script
const s = document.getElementById("webmcp-provider");
const d = JSON.parse(s.getAttribute("data-webmcp-tools") || "[]");
const ns = "_test";
window[ns] = {};
d.forEach((t, i) => {
  const sc = document.createElement("script");
  sc.textContent = `window["${ns}"]["f${i}"] = ${t.executeStr};`;
  document.head.appendChild(sc);
  document.head.removeChild(sc);
});
const reconstructed = d.map((e, i) => ({
  ...e,
  execute: window[ns]["f" + i],
}));
delete window[ns];
navigator.modelContext.provideContext({ tools: reconstructed });

// 3. List registered tools
console.table(
  tools.map((t) => ({
    name: t.name,
    readOnly: t.annotations?.readOnlyHint,
  })),
);

// 4. Execute a read-only tool
const result = tools.find((t) => t.name === "get-page-info").execute({});
console.log(result);

// 5. Execute a tool with requestUserInteraction
const mockClient = {
  requestUserInteraction: async (cb) => await cb(),
};
const navResult = await tools
  .find((t) => t.name === "navigate-to")
  .execute({ path: "/blog/" }, mockClient);
console.log(navResult);
```

---

## Ecosystem Survey

As of February 2026, WebMCP is an early-stage proposal. A survey of known implementations reveals distinct approaches:

### Implementation Approaches in the Wild

| Approach                      | Description                                            | Examples                                                                        |
| ----------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **Astro SSG + inline script** | Server-rendered tools serialized into HTML             | jmrp.io (this site)                                                             |
| **JavaScript bundle**         | Tools registered from a JS bundle on page load         | weather-tools.vercel.app, web-arcade.vercel.app, webmcp-music-player.vercel.app |
| **Declarative forms**         | No JS API — tools inferred from HTML `<form>` elements | webmcp-todo.nichochar.com                                                       |
| **React SPA**                 | Tools registered within React lifecycle                | tabmcp.nichochar.com                                                            |

### Feature Comparison

| Feature                                  | jmrp.io         | JS Bundle Sites                   | Declarative Sites       |
| ---------------------------------------- | --------------- | --------------------------------- | ----------------------- |
| `provideContext()`                       | ✅              | ✅                                | ❌ (no JS API)          |
| `registerTool()`                         | ✅              | ❌ (most use only provideContext) | ❌                      |
| `clearContext()` on navigation           | ✅              | ❌                                | ❌                      |
| `requestUserInteraction()`               | ✅              | ❌                                | ❌                      |
| `annotations.readOnlyHint` on ALL tools  | ✅              | Partial                           | ❌                      |
| `inputSchema` on all parameterized tools | ✅              | Partial                           | ❌ (inferred from form) |
| Static manifest                          | ✅              | ❌                                | ❌                      |
| `<link rel="webmcp-manifest">`           | ✅              | ❌                                | ❌                      |
| SPA lifecycle management                 | ✅              | ❌                                | ❌                      |
| Multiple page contexts                   | ✅ (6 contexts) | ❌ (single)                       | ❌ (single)             |
| Tool count                               | 30              | 3-8                               | 2-4                     |

### Key Findings

1. **No other site implements `requestUserInteraction()`** — most tools are read-only or modify state without asking the user. The spec's `buyProduct` example describes the intended pattern, but no known implementation follows it.
2. **No other site manages tool lifecycles across SPA navigation** — most are single-page apps or static pages without navigation concerns. The spec doesn't address this because it focuses on individual page contexts.
3. **The manifest + `<link>` discovery approach is unique** — other sites rely solely on runtime JavaScript registration. The spec acknowledges manifests as a "future iteration" but no standard format exists yet.
4. **Most implementations skip `annotations` entirely** — jmrp.io is the only known site annotating every tool with explicit `readOnlyHint` values.
5. **JS bundle sites tend to have fewer tools (3-8)** — focused on a single app context. jmrp.io's 30 tools across 6 contexts is the most comprehensive catalog observed.
6. **The declarative forms approach (webmcp-todo.nichochar.com)** is interesting but non-standard — tools are inferred from `<form>` elements rather than registered via the JavaScript API. This works without JS but doesn't follow the spec's tool registration model.
7. **All observed implementations use feature detection** — wrapping registration in `if (navigator.modelContext)` checks, ensuring forward-compatibility with no breakage.

---

## Browser Compatibility

**Current status**: Chrome Canary 147+ supports `navigator.modelContext` behind the `chrome://flags/#enable-webmcp-testing` flag (as of February 2026). No stable browser implements it yet.

### Chrome Canary 147 — Verified API Behavior

Tested against the real Chrome implementation with the following findings:

| Feature | Behavior |
| ------- | -------- |
| `provideContext({ tools })` | **Replaces** all previous provideContext tools (not additive). `tools` property is **required**. |
| `registerTool(tool)` | Registers in a **separate namespace** from provideContext. Throws `DOMException: Duplicate tool name` on duplicates within its own namespace. |
| `unregisterTool(name)` | Only works for `registerTool()` tools. Throws for provideContext tools or non-existent names. |
| `clearContext()` | Clears **both** namespaces (provideContext + registerTool). |
| `inputSchema` | Fully supported — JSON Schema validated. |
| `annotations` | `readOnlyHint` and `openWorldHint` both accepted. |
| Async execute | Both sync and async (Promise-returning) execute callbacks work. |
| Namespace isolation | provideContext and registerTool names don't conflict with each other. |

### How the implementation maps to the API

- **`WebMCPProvider.astro`** uses `provideContext()` for page-context tools (site + section-specific).
- **App components** use `registerTool()` for individual tool functionality (hash, base64, etc.).
- **View Transitions**: `astro:before-swap` calls `clearContext()` to clean both namespaces before the new page re-registers its tools.

### Progressive Enhancement

The implementation is designed as a forward-looking progressive enhancement:

- When browsers add support, the site's tools will automatically become available to AI agents
- Until then, the code is completely inert (no performance impact, no errors, no console output)
- The WebMCP Tester tool provides a way to verify the implementation works correctly via polyfill
- All feature detection uses the guard pattern: `if (typeof navigator !== "undefined" && "modelContext" in navigator && navigator.modelContext)` — safe even in SSR contexts

---

## Removal Instructions

To completely remove WebMCP support from the project:

### 1. Delete new files

```bash
rm src/types/webmcp.ts
rm src/utils/webmcp.ts
rm src/utils/webmcp-tools.ts
rm src/components/layout/WebMCPProvider.astro
rm src/components/apps/WebMCPTester.astro
rm src/content/tools/en/webmcp-tester.mdx
rm src/content/tools/es/webmcp-tester.mdx
rm public/.well-known/webmcp.json
rm docs/WEBMCP.md
```

### 2. Remove from BaseLayout.astro (~3 lines)

```diff
- import WebMCPProvider from "@components/layout/WebMCPProvider.astro";
  ...
- <WebMCPProvider />
```

### 3. Remove from BaseHead.astro (~1 line)

```diff
- <link rel="webmcp-manifest" href="/.well-known/webmcp.json" type="application/json" />
```

### 4. Remove from ToolPage.astro (~2 lines)

```diff
- import WebMCPTester from "@components/apps/WebMCPTester.astro";
  ...
-   WebMCPTester,
```

### 5. Remove WebMCP blocks from app components

In each of the 15 files in `src/components/apps/*.astro`, delete the block between:

```javascript
// === WebMCP START ===
...
// === WebMCP END ===
```

### 6. Remove i18n keys

Delete the `webmcpTester: { ... }` block from:

- `src/i18n/translations/en/tools.ts`
- `src/i18n/translations/es/tools.ts`

### 7. Clean up misc files

- Remove "webmcp" from `cspell-project-words.txt`
- Remove WebMCP sections from `public/llms.txt` and `public/llms-full.txt`
- Remove WebMCP section from `CLAUDE.md`

---

## Changelog

### v0.2.0 (February 2026)

- **`requestUserInteraction()`**: Added to `navigate-to` and `switch-language` tools — first known implementation of this spec feature
- **View Transitions lifecycle**: `clearContext()` called on `astro:before-swap` to prevent stale tools across Astro page navigations
- **Type alignment**: `WebMCPToolExecuteCallback` updated — `client` parameter now optional for defensive coding
- **Manifest v0.2.0**: Added `specDate`, `features` array for machine-readable capability declaration
- **Cross-page tools on tester**: WebMCP Tester page receives all tool categories for comprehensive testing

### v0.1.0 (February 2026)

- Initial implementation with 30 tools across 6 page contexts
- `provideContext()` + `registerTool()` two-phase registration
- Static `.well-known/webmcp.json` manifest with `<link rel="webmcp-manifest">`
- WebMCP Tester interactive tool
- Full `annotations.readOnlyHint` on all tools
- `inputSchema` (JSON Schema) on all parameterized tools
- Function serialization via `.toString()` + dynamic `<script>` injection (CSP-compatible)

---

## References

- [WebMCP Specification (W3C Editor's Draft, Feb 12, 2026)](https://webmachinelearning.github.io/webmcp/)
- [WebMCP Explainer / Proposal (GitHub)](https://github.com/webmachinelearning/webmcp)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io)
- [Astro View Transitions](https://docs.astro.build/en/guides/view-transitions/)
- [Content Security Policy `strict-dynamic`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/script-src#strict-dynamic)
- [JSON Schema (draft-07)](https://json-schema.org/)
- [llmstxt.org Standard](https://llmstxt.org)
