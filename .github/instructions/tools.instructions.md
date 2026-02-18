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
- Tool routing: `src/pages/tools/[...slug].astro` (contains `componentMap`)

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
appComponent: "MyTool" # Maps to componentMap key
tags: ["utility"]
---
Documentation content here (rendered in the "info" slot).
```

### 2. Create the component

```astro
---
interface Props {
  // Props from appProps in frontmatter
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

### 3. Register in componentMap

Add to `src/pages/tools/[...slug].astro`:

```typescript
const componentMap: Record<string, any> = {
  // ...existing entries
  MyTool: (await import("@components/apps/MyTool.astro")).default,
};
```

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

## Existing Tools (14)

`base64-encoder`, `cert-inspector`, `color-contrast-checker`, `cron-builder`, `csp-builder`, `hash-calculator`, `http-headers-analyzer`, `modbus-frame-builder`, `nginx-config-generator`, `password-generator`, `regex-tester`, `subnet-calculator`, `timestamp-converter`, `wireguard-config-generator`
