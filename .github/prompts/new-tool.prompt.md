---
name: new-tool
description: Scaffold a new interactive tool with MDX content, Astro component, and componentMap registration
argument-hint: "[tool-name] [category]"
agent: implementer
---

Create a new interactive tool for jmrp.io following these steps:

1. **Create the MDX content file** at `src/content/tools/${input:slug}.mdx`:

```mdx
---
title: "${input:title}"
slug: "${input:slug}"
description: "Short description ≤ 155 characters"
icon: "i-mdi:icon-name"
category: "${input:category}"  # security | developer | network | embedded | mikrotik
appComponent: "${input:componentName}"
tags: []
---

Documentation about what this tool does and how to use it.
```

2. **Create the Astro component** at `src/components/apps/${input:componentName}.astro`:

```astro
---
interface Props {
  // Props from appProps in frontmatter (if any)
}
---

<div class="tool-container">
  <!-- Tool UI using UnoCSS classes -->
  <div class="tool-input" data-input="main">
    <!-- Input elements -->
  </div>
  <div class="tool-output" data-output="result">
    <!-- Output display -->
  </div>
</div>

<script is:inline nonce="NGINX_CSP_NONCE">
  // Vanilla JS only — NO frameworks (NO Preact)
  // Use data-* attributes for DOM selection
  // Generate IDs with crypto.getRandomValues()
  
  const container = document.currentScript?.previousElementSibling?.closest('.tool-container');
  if (container) {
    // Tool logic here
  }
</script>

<style>
  .tool-container {
    /* Scoped styles using CSS custom properties */
  }
</style>
```

3. **Register in componentMap**: Add entry to `src/pages/tools/[...slug].astro`:

```typescript
${input:componentName}: (await import("@components/apps/${input:componentName}.astro")).default,
```

4. **Design rules**:
   - **No Preact** — Tools use `<script is:inline>` with vanilla JS
   - **No inline styles** — Use UnoCSS classes or scoped `<style>`
   - **Data attributes** — Use `data-*` for DOM selection, not `getElementById`
   - **Unique IDs** — Generate with `crypto.getRandomValues()`
   - **CSP compliance** — Scripts use `nonce="NGINX_CSP_NONCE"`
   - **Privacy-first** — All processing client-side only
   - **WCAG AA** — Keyboard accessible, proper ARIA labels
   - **Dark mode** — Use CSS custom properties for theming
