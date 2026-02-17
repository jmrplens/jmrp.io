---
applyTo: "src/content/posts/**/*.mdx"
---

# Blog Content Instructions

## File Naming

- `NNN-slug.mdx` (e.g., `009-post-name.mdx`)
- Files starting with `_` are excluded (templates)
- Template at `src/content/posts/_template.mdx`

## Frontmatter

```yaml
title: "Post Title" # Required
slug: "post-slug" # Required
publishedDate: 2025-01-15 # Required (YYYY-MM-DD)
updatedDate: 2025-02-01 # Optional
description: "SEO description ≤155c" # Optional, max 155 chars
tags: ["nginx", "security"] # Optional
draft: false # Default: false
coverImage: ./cover.webp # Optional
```

## Imports

```mdx
import Callout from "@components/ui/Callout.astro";
import { Tabs, TabPanel } from "@components/ui/tabs";
import Mermaid from "@components/ui/Mermaid.astro";
import TLDRSummary from "@components/ui/TLDRSummary.astro";
```

See `src/components/ui/AGENTS.md` for the complete component reference.

## Content Rules

- Heading hierarchy: h1 (auto from title) → h2 → h3 — never skip levels
- All images require descriptive `alt` text
- `description` must be ≤ 155 characters (enforced by Playwright tests)
- `<Mermaid>` requires `ariaLabel` prop
- References auto-collected from markdown links and `<a>` tags
- Code blocks: use triple backticks with language identifier
- Mermaid node classes: `.success`, `.warning`, `.danger`, `.info`, `.highlight`, `.secondary`

## Component Patterns

````mdx
<TLDRSummary>Quick summary of the post.</TLDRSummary>

<Callout
  type="warning"
  title="Important"
>
  Warning content here.
</Callout>

<Tabs>
  <TabPanel label="Linux">```bash sudo apt install nginx ```</TabPanel>
</Tabs>
````

## i18n

- Blog post content (MDX) is in English only — not translated
- Code snippets stay in English
- UI chrome around posts (dates, labels, aria) is translated via `t()`
- Component props like `title` in `<Callout>` are part of post content and stay in English

## Don'ts

- No `<script>` tags in MDX (breaks CSP)
- No inline styles
- No heading level skipping
- No descriptions > 155 characters
- No images without alt text
