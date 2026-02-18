---
paths:
  - "src/content/posts/**/*.mdx"
---

# Blog Content Rules

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

## Content Rules

- Heading hierarchy: h1 (auto from title) → h2 → h3 — never skip levels
- All images require descriptive `alt` text
- `description` must be ≤ 155 characters (enforced by Playwright tests)
- `<Mermaid>` requires `ariaLabel` prop
- References auto-collected from markdown links and `<a>` tags
- Blog content is in English only — UI chrome is translated via `t()`
- Code snippets stay in English
- No `<script>` tags in MDX (breaks CSP)
- No inline styles
