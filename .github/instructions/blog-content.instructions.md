---
applyTo: "src/content/posts/**/*.mdx"
---

# Blog Content Instructions

## File Naming

- `NNN-slug.mdx` (e.g., `009-post-name.mdx`) under `src/content/posts/{en,es}/`
- Files starting with `_` are excluded (templates)
- Template at `src/content/posts/en/_template.mdx`

## Frontmatter

```yaml
title: "Post Title" # Required
slug: "009-post-slug" # Required — must start with the NNN- prefix
publishedDate: 2025-01-15 # Required (YYYY-MM-DD)
updatedDate: 2025-02-01 # Optional (when revised; else dateModified falls back to publishedDate)
description: "SEO description ≤155c" # Optional, max 155 chars
tags: ["nginx", "security"] # Optional
draft: false # Default: false
coverImage: ./cover.webp # Optional (rendered as AVIF+WebP <picture>)
# --- GEO / structured-data fields ---
articleType: "TechArticle" # "TechArticle" for guides, "BlogPosting" (default) for narrative
proficiencyLevel: "Intermediate" # Beginner | Intermediate | Expert (optional)
topics: # Wikidata-linked topics → JSON-LD about (first) + mentions (rest), max 6
  - name: "Content Security Policy"
    wikidata: "Q1128636" # VERIFIED bare Q-id (wrong Q-id is worse than none)
faq: # genuine Q&A → rendered FAQ section + FAQPage JSON-LD
  - question: "Why verify the MAC before decrypting?"
    answer: "To avoid a padding-oracle: never act on bytes you have not authenticated."
howto: # optional — step-by-step guides only (emits a HowTo graph node)
  name: "Set up X"
  steps:
    - name: "First step"
      text: "What to do."
      anchor: "first-step" # links the step to its in-page heading id
```

**Every post must carry:** a `<TLDRSummary>` (the TL;DR answer-target, rendered as `<h2>`),
`articleType: "TechArticle"` (for guides), verified `topics` Q-ids, and a genuine `faq`.
The FAQ section, JSON-LD (TechArticle/FAQPage/HowTo + about/mentions), author bio card, and
References list are emitted automatically by `BlogPost.astro` — do NOT add `<FAQ>` or
`<AuthorCard>` by hand. The Spanish version carries its own translated `faq` and the SAME
`topics` Q-ids.

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
