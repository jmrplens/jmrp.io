---
paths:
  - "src/components/apps/**/*.astro"
  - "src/content/tools/**/*.mdx"
  - "src/pages/tools/**/*.astro"
---

# Tools Rules

## Architecture

Tools are interactive web utilities at `/tools/[slug]/`. They are **NOT Preact** — they use pure Astro components with vanilla JavaScript.

## Design Rules

- **No Preact** — Tools use `<script is:inline>` with vanilla JS
- **No inline styles** — Use UnoCSS classes
- **Data attributes** — Use `data-*` for DOM selection, not `getElementById`
- **Unique IDs** — Generate with `crypto.getRandomValues()`
- **CSP compliance** — Scripts use `nonce="NGINX_CSP_NONCE"`
- **Privacy-first** — All processing happens client-side
- **WCAG AA** — Tools must be keyboard accessible with proper ARIA
- **Dark mode** — CSS custom properties for theming

## Categories (ordered)

1. `security` — Security-related tools
2. `developer` — Development utilities
3. `network` — Network analysis tools
4. `embedded` — Embedded systems tools
5. `mikrotik` — MikroTik-specific tools
