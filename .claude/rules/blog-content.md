---
paths:
  - "src/content/posts/**/*.mdx"
---

# Blog Content Rules

## File Naming

- `NNN-slug.mdx` (e.g., `009-post-name.mdx`) under `src/content/posts/{en,es}/`
- Files starting with `_` are excluded (templates)
- Template at `src/content/posts/en/_template.mdx`

## Frontmatter

```yaml
title: "Post Title" # Required
slug: "009-post-slug" # Required — must start with the NNN- prefix
publishedDate: 2025-01-15 # Required (YYYY-MM-DD)
updatedDate: 2025-02-01 # Optional (else dateModified falls back to publishedDate)
description: "SEO description ≤155c" # Optional, max 155 chars
tags: ["nginx", "security"] # Optional
draft: false # Default: false
coverImage: ./cover.webp # Optional (AVIF+WebP <picture>)
articleType: "TechArticle" # "TechArticle" (guides) | "BlogPosting" (default)
proficiencyLevel: "Intermediate" # Beginner | Intermediate | Expert (optional)
topics: # Wikidata topics → about (first) + mentions (rest), max 6
  - name: "Topic Name"
    wikidata: "Q12345" # VERIFIED bare Q-id
faq: # genuine Q&A → FAQ section + FAQPage JSON-LD
  - question: "..."
    answer: "..."
howto: # optional, step-by-step guides → HowTo JSON-LD (see content.config.ts)
```

## Required for every post

- **TL;DR**: a `<TLDRSummary>` near the top — after a short intro paragraph, before the first `##` (renders as `<h2>` answer-target). Consistent format: cover → intro → TL;DR → body.
- **`articleType: "TechArticle"`** for guides; verified **`topics`** Q-ids (1 about + ≤5 mentions); a genuine **`faq`**
- **`howto`** for step-by-step guides
- The FAQ section, JSON-LD, author bio card, and References are auto-rendered by `BlogPost.astro` — do NOT add `<FAQ>`/`<AuthorCard>` by hand
- The Spanish version carries its own translated `faq` and the SAME `topics` Q-ids

## Content Rules

- Heading hierarchy: h1 (auto from title) → h2 → h3 — never skip levels; avoid identical heading text (ambiguous ToC anchors)
- All images require descriptive `alt` text
- `description` must be ≤ 155 characters (enforced by Playwright tests)
- `<Mermaid>` requires `ariaLabel` prop
- References auto-collected from markdown links and `<a>` tags
- Blog content is in English only — UI chrome is translated via `t()`
- Code snippets stay in English
- No `<script>` tags in MDX (breaks CSP)
- No inline styles
