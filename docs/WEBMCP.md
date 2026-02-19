# WebMCP Implementation — jmrp.io

> **Status**: Experimental (`feat/webmcp` branch)
> **Spec**: [WebMCP — Model Context Protocol for the Web](https://webmachinelearning.github.io/webmcp/)
> **Repository**: [webmachinelearning/webmcp](https://github.com/webmachinelearning/webmcp)

## What is WebMCP?

WebMCP (Model Context Protocol for the Web) is a **W3C proposal** (August 2025, still draft) by Microsoft and Google that extends the browser with a `navigator.modelContext` API. It allows websites to expose their functionality as structured **tools** that browser-based AI agents can discover and invoke.

Think of it as a standard interface between websites and AI assistants built into the browser — the web equivalent of [MCP (Model Context Protocol)](https://modelcontextprotocol.io) for server-side AI tools.

### API Surface

```typescript
interface ModelContext {
  provideContext(options: { tools: WebMCPTool[] }): void;
  registerTool(tool: WebMCPTool): void;
  unregisterTool(name: string): void;
  clearContext(): void;
}

interface WebMCPTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  execute: (input: Record<string, unknown>, client: WebMCPClient) => unknown;
  annotations?: { readOnlyHint?: boolean };
}

// Access via:
navigator.modelContext.provideContext({ tools: [...] });
navigator.modelContext.registerTool(tool);
```

### Key Concepts

- **Tools**: Functions that AI agents can call. Each has a name, description, JSON Schema for inputs, and an execute callback.
- **Annotations**: Metadata like `readOnlyHint` to indicate whether a tool modifies page state.
- **Client**: Provides `requestUserInteraction()` for tools that need user confirmation before acting.
- **Discovery**: A `.well-known/webmcp.json` manifest lists all available tools for agent pre-indexing.

---

## Implementation Overview

This site implements the **full WebMCP spec** as progressive enhancement with:

- **Zero npm dependencies** — pure vanilla JS/TypeScript
- **Non-structural changes** — designed for easy removal
- **Feature detection everywhere** — completely inert if `navigator.modelContext` doesn't exist
- **30 registered tools** across all page contexts

### Design Principles

1. **Progressive enhancement**: All WebMCP code is guarded by feature detection. If no browser supports the API, the code simply doesn't execute.
2. **Easy removal**: New files are self-contained; modifications to existing files are minimal and marked with `// === WebMCP START/END ===` comments.
3. **Zero dependencies**: Everything is implemented in vanilla TypeScript/JavaScript with no external libraries.
4. **Privacy-first**: All tool execution happens client-side in the browser.

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
│     └─ Reconstructs execute functions via new Function()        │
│     └─ Calls navigator.modelContext.provideContext({ tools })   │
│                                                                 │
│  3. Each app component's WebMCP block runs                      │
│     └─ Calls navigator.modelContext.registerTool(appTool)       │
│                                                                 │
│  4. AI agent discovers tools and invokes them                   │
│     └─ tool.execute(input, client) → { content: [...] }        │
└─────────────────────────────────────────────────────────────────┘
```

### Function Serialization

Astro's `define:vars` cannot serialize JavaScript functions. The solution:

1. **Server-side**: `tool.execute.toString()` converts each function to a string
2. **Transport**: Serialized as JSON in a `data-webmcp-tools` attribute
3. **Client-side**: `new Function("input", "client", "return (" + executeStr + ")(input, client)")` reconstructs the callable function

This means tool execute functions cannot use closures over server-side variables — they must be self-contained.

### Tool Registration Strategy

| Context                | Method             | Location                                  |
| ---------------------- | ------------------ | ----------------------------------------- |
| Site-wide tools (6)    | `provideContext()` | WebMCPProvider.astro                      |
| Blog tools (2)         | `provideContext()` | WebMCPProvider.astro (path-conditional)   |
| CV tools (5)           | `provideContext()` | WebMCPProvider.astro (path-conditional)   |
| Publications tools (2) | `provideContext()` | WebMCPProvider.astro (path-conditional)   |
| Tools-index tools (2)  | `provideContext()` | WebMCPProvider.astro (path-conditional)   |
| App tools (13)         | `registerTool()`   | Each app component's `<script is:inline>` |

The provider uses `provideContext()` (which replaces all tools) for the base set, then each app component uses `registerTool()` (which adds without replacing) for its specific tool.

---

## File Reference

### New Files (all removable)

| File                                         | Lines | Purpose                                                                                                                                                                 |
| -------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/webmcp.ts`                        | ~75   | TypeScript interfaces: `WebMCPTool`, `WebMCPClient`, `WebMCPModelContext`, `WebMCPManifest`, Navigator augmentation                                                     |
| `src/utils/webmcp.ts`                        | ~95   | Safe wrapper functions: `isWebMCPSupported()`, `provideContext()`, `registerTool()`, `unregisterTool()`, `clearContext()`, `registerTools()`                            |
| `src/utils/webmcp-tools.ts`                  | ~500  | Tool catalog: `getSiteTools()`, `getBlogTools()`, `getCVTools()`, `getPublicationsTools()`, `getToolsIndexTools()`, `generateAppToolRegistrationScript()`, `inputStr()` |
| `src/components/layout/WebMCPProvider.astro` | ~110  | Astro component: serializes tools, injects client-side registration script                                                                                              |
| `src/components/apps/WebMCPTester.astro`     | ~600  | Interactive testing tool: polyfills API, lists tools, executes them, views manifest                                                                                     |
| `public/.well-known/webmcp.json`             | ~400  | Static manifest: 30 tool definitions with schemas and `availableOn` paths                                                                                               |
| `src/content/tools/en/webmcp-tester.mdx`     | ~80   | Tool documentation (English)                                                                                                                                            |
| `src/content/tools/es/webmcp-tester.mdx`     | ~80   | Tool documentation (Spanish)                                                                                                                                            |
| `docs/WEBMCP.md`                             | —     | This file                                                                                                                                                               |

### Modified Files (minimal changes)

| File                                     | Change                                       | Lines       |
| ---------------------------------------- | -------------------------------------------- | ----------- |
| `src/layouts/BaseLayout.astro`           | Import + `<WebMCPProvider />`                | +3          |
| `src/components/layout/BaseHead.astro`   | `<link rel="webmcp-manifest">`               | +1          |
| `src/components/pages/ToolPage.astro`    | Import + componentMap entry for WebMCPTester | +2          |
| `src/components/apps/*.astro` (14 files) | WebMCP registration blocks in inline scripts | +20-60 each |
| `src/i18n/translations/en/tools.ts`      | `webmcpTester` translation keys              | +35         |
| `src/i18n/translations/es/tools.ts`      | `webmcpTester` translation keys              | +35         |
| `public/llms.txt`                        | WebMCP section                               | +5          |
| `public/llms-full.txt`                   | WebMCP bullet                                | +1          |
| `cspell-project-words.txt`               | "webmcp"                                     | +1          |
| `CLAUDE.md`                              | WebMCP documentation section                 | +55         |

---

## Tool Catalog (30 tools)

### Site-Wide Tools (available on every page)

| Tool                  | Description                                        | Type      |
| --------------------- | -------------------------------------------------- | --------- |
| `toggle-theme`        | Switches between dark and light theme              | Mutating  |
| `get-theme`           | Returns current theme (dark/light)                 | Read-only |
| `navigate-to-page`    | Navigates to a specified URL path                  | Mutating  |
| `get-page-info`       | Returns current page title, URL, description, lang | Read-only |
| `switch-language`     | Switches between English and Spanish               | Mutating  |
| `get-site-navigation` | Returns all navigation links from the header       | Read-only |

### Blog Tools (available on `/blog/*`)

| Tool                | Description                                    | Type      |
| ------------------- | ---------------------------------------------- | --------- |
| `list-blog-posts`   | Lists all blog posts visible on the page       | Read-only |
| `search-blog-posts` | Searches posts by keyword in title/description | Read-only |

### CV Tools (available on `/cv`)

| Tool                    | Description                                  | Type      |
| ----------------------- | -------------------------------------------- | --------- |
| `get-cv-summary`        | Returns profile summary from the CV page     | Read-only |
| `get-cv-skills`         | Returns technical skills grouped by category | Read-only |
| `get-cv-experience`     | Returns work experience timeline             | Read-only |
| `get-cv-education`      | Returns education history                    | Read-only |
| `get-cv-certifications` | Returns professional certifications          | Read-only |

### Publications Tools (available on `/publications`)

| Tool                  | Description                      | Type      |
| --------------------- | -------------------------------- | --------- |
| `list-publications`   | Lists all academic publications  | Read-only |
| `search-publications` | Searches publications by keyword | Read-only |

### Tools Index Tools (available on `/tools/*`)

| Tool                   | Description                                | Type      |
| ---------------------- | ------------------------------------------ | --------- |
| `list-available-tools` | Lists all tools with descriptions          | Read-only |
| `get-tool-info`        | Gets details about a specific tool by name | Read-only |

### App-Specific Tools (available on individual tool pages)

| Tool                      | Page                            | Description                     |
| ------------------------- | ------------------------------- | ------------------------------- |
| `hash-calculator`         | `/tools/hash-calculator`        | Compute SHA-256/384/512 hashes  |
| `base64-encode-decode`    | `/tools/base64-encoder`         | Encode/decode Base64            |
| `subnet-calculator`       | `/tools/subnet-calculator`      | Calculate subnet information    |
| `password-generator`      | `/tools/password-generator`     | Generate secure passwords       |
| `timestamp-converter`     | `/tools/timestamp-converter`    | Convert Unix timestamps         |
| `regex-tester`            | `/tools/regex-tester`           | Test regular expressions        |
| `color-contrast-checker`  | `/tools/color-contrast-checker` | Check WCAG contrast ratios      |
| `cron-expression-builder` | `/tools/cron-builder`           | Parse/build cron expressions    |
| `csp-builder`             | `/tools/csp-builder`            | Build Content Security Policies |
| `cert-inspector`          | `/tools/cert-inspector`         | Inspect SSL/TLS certificates    |
| `http-headers-analyzer`   | `/tools/http-headers-analyzer`  | Analyze HTTP headers            |
| `modbus-frame-builder`    | `/tools/modbus-frame-builder`   | Build Modbus RTU/TCP frames     |
| `webmcp-tester`           | `/tools/webmcp-tester`          | Test WebMCP tools interactively |

---

## Discovery Mechanisms

### 1. Link Tag (HTML)

Every page includes a `<link>` tag pointing to the manifest:

```html
<link
  rel="webmcp-manifest"
  href="/.well-known/webmcp.json"
  type="application/json"
/>
```

### 2. Well-Known Manifest (JSON)

The static manifest at `/.well-known/webmcp.json` follows the proposed standard for declarative tool discovery:

```json
{
  "version": "0.1.0",
  "name": "jmrp.io",
  "description": "Personal technical blog and portfolio",
  "tools": [
    {
      "name": "toggle-theme",
      "description": "...",
      "inputSchema": { ... },
      "annotations": { "readOnlyHint": false },
      "availableOn": ["*"]
    }
  ]
}
```

Each tool includes an `availableOn` array indicating which pages register it (e.g., `["*"]` for site-wide, `["/tools/hash-calculator*"]` for page-specific).

### 3. LLM Context Files

Both `public/llms.txt` and `public/llms-full.txt` include a WebMCP section describing the API availability.

---

## Testing

### WebMCP Tester Tool

The site includes a built-in testing tool at `/tools/webmcp-tester/` that:

1. **Polyfills** `navigator.modelContext` with a simulation that captures tool registrations
2. **Re-executes** the WebMCPProvider script and all app component WebMCP blocks
3. **Lists** all discovered tools with their schemas and annotations
4. **Executes** tools with user-provided inputs and displays results
5. **Inspects** the `.well-known/webmcp.json` manifest

### Manual Testing via DevTools

You can test the API directly in the browser console:

```javascript
// 1. Create the polyfill
const tools = [];
navigator.modelContext = {
  provideContext: (opts) => {
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
const reconstructed = d.map((e) => ({
  ...e,
  execute: new Function(
    "input",
    "client",
    "return (" + e.executeStr + ")(input, client)",
  ),
}));
navigator.modelContext.provideContext({ tools: reconstructed });

// 3. List registered tools
console.table(tools.map((t) => ({ name: t.name, desc: t.description })));

// 4. Execute a tool
const result = tools.find((t) => t.name === "get-page-info").execute({}, {});
console.log(result);
```

---

## Browser Compatibility

**Current status**: No browser implements `navigator.modelContext` as of February 2026.

The implementation is designed as a forward-looking progressive enhancement:

- When browsers add support, the site's tools will automatically become available to AI agents
- Until then, the code is completely inert (no performance impact, no errors, no console output)
- The WebMCP Tester tool provides a way to verify the implementation works correctly via polyfill

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

In each of the 14 files in `src/components/apps/*.astro`, delete the block between:

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

## References

- [WebMCP Specification (W3C Draft)](https://webmachinelearning.github.io/webmcp/)
- [WebMCP GitHub Repository](https://github.com/webmachinelearning/webmcp)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io)
