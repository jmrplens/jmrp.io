---
name: new-tool
description: Scaffold a new interactive tool with MDX content and its Astro app component
argument-hint: "[tool-name] [category]"
agent: implementer
---

Create a new interactive tool for jmrp.io following these steps:

1. **Create the MDX content file** at `src/content/tools/en/${input:slug}.mdx` (then mirror it to `es/` with the same slug):

```mdx
---
title: "${input:title}"
slug: "${input:slug}"
description: "Short description ≤ 155 characters"
icon: "i-mdi:icon-name"
category: "${input:category}"  # security | developer | network | embedded | mikrotik
tags: []
---

import ${input:componentName} from "@components/apps/${input:componentName}.astro";
import ToolApp from "@components/ui/ToolApp.astro";
import ToolInfo from "@components/ui/ToolInfo.astro";

<ToolApp>
  <${input:componentName} />
</ToolApp>

<ToolInfo>
  Documentation about what this tool does and how to use it.
</ToolInfo>
```

The MDX importing its own app is what keeps the page's CSS to this tool's own
styles instead of every app's. Component props go in the JSX, not in
frontmatter.

1. **Create the Astro component** at `src/components/apps/${input:componentName}.astro`:

```astro
---
interface Props {
  // Props passed from the MDX, e.g. <Tool showExplanation />
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

1. **No registration step**: there is no component map. The MDX import from
   step 1 is the whole wiring, and it is also what `sitemap-post-dates.ts`
   parses to keep the tool's sitemap `<lastmod>` tracking its component.

1. **Design rules**:
   - **No Preact** — Tools use `<script is:inline>` with vanilla JS
   - **No inline styles** — Use UnoCSS classes or scoped `<style>`
   - **Data attributes** — Use `data-*` for DOM selection, not `getElementById`
   - **Unique IDs** — Generate with `crypto.getRandomValues()`
   - **CSP compliance** — Scripts use `nonce="NGINX_CSP_NONCE"`
   - **Privacy-first** — All processing client-side only
   - **WCAG AA** — Keyboard accessible, proper ARIA labels
   - **Dark mode** — Use CSS custom properties for theming
