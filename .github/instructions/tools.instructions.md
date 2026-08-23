---
applyTo: "src/components/apps/**/*.astro,src/content/tools/**/*.mdx,src/pages/tools/**/*.astro"
---

# Tools Instructions

## Architecture

Tools are interactive web utilities at `/tools/[slug]/`. They are **NOT Preact** — they use pure Astro components with vanilla JavaScript.

## File Locations

- Tool content: `src/content/tools/*.mdx` (frontmatter + documentation)
- Tool components: `src/components/apps/*.astro` (interactive UI)
- Tool layout: `src/layouts/ToolLayout.astro`
- Tool wrappers: `src/components/ui/ToolApp.astro` (interactive app) + `src/components/ui/ToolInfo.astro` (documentation card) — used from the MDX
- Tool routing: `src/pages/tools/[...slug].astro` → `src/components/pages/ToolPage.astro` (no component registry: each MDX imports its own app)

## Adding a New Tool

### 1. Create MDX content

```yaml
# src/content/tools/my-tool.mdx
---
title: "My Tool"
slug: "my-tool"
description: "Short description ≤ 155 chars"
icon: "i-mdi:wrench"
category: "developer" # security | developer | network | embedded | mikrotik
tags: ["utility"]
---
import MyTool from "@components/apps/MyTool.astro";
import ToolApp from "@components/ui/ToolApp.astro";
import ToolInfo from "@components/ui/ToolInfo.astro";

<ToolApp>
<MyTool />
</ToolApp>

<ToolInfo>
Documentation content here.
</ToolInfo>
```

The MDX imports its own app: that is what keeps the page's CSS to this tool's
own styles instead of all 17 apps' (−31 % gz). Props go in the JSX
(`<MyTool showExplanation />`), not in frontmatter.

### 2. Create the component

```astro
---
interface Props {
  // Props passed from the MDX, e.g. <MyTool showExplanation />
}
---

<!-- src/components/apps/MyTool.astro -->
<div class="tool-container">
  <!-- UI here -->
</div>

<script is:inline nonce="NGINX_CSP_NONCE">
  // Vanilla JS — NO frameworks
  // Use data-* attributes for DOM selection
  // Generate IDs with crypto.getRandomValues()
</script>
```

### 3. Nothing to register

There is no component registry. The MDX import from step 1 is the only wiring —
which is also what `sitemap-post-dates.ts` parses to keep the tool's sitemap
`<lastmod>` tracking its component. Mirror the MDX to `src/content/tools/es/`
with the same slug.

## Design Rules

- **No Preact** — Tools use `<script is:inline>` with vanilla JS
- **No inline styles** — Use UnoCSS classes
- **Data attributes** — Use `data-*` for DOM selection, not `getElementById`
- **Unique IDs** — Generate with `crypto.getRandomValues()`
- **CSP compliance** — Scripts use `nonce="NGINX_CSP_NONCE"`
- **Privacy-first** — All processing happens client-side
- **WCAG AA** — Tools must be keyboard accessible with proper ARIA
- **Dark mode** — CSS custom properties for theming
- **i18n** — Tool-specific strings in `src/i18n/translations/{en,es}/tools.ts`, inject into JS via `data-*` attributes

## Categories (ordered)

1. `security` — Security-related tools
2. `developer` — Development utilities
3. `network` — Network analysis tools
4. `embedded` — Embedded systems tools
5. `mikrotik` — MikroTik-specific tools

## Existing Tools (17)

`base64-encoder`, `cert-inspector`, `color-contrast-checker`, `cron-builder`, `csp-builder`, `etm-envelope-visualizer`, `hash-calculator`, `http-headers-analyzer`, `modbus-frame-builder`, `nginx-config-generator`, `password-generator`, `pin-brute-force-calculator`, `regex-tester`, `string-pool-packer`, `subnet-calculator`, `timestamp-converter`, `wireguard-config-generator`
