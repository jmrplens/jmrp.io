---
name: new-blog-post
description: Scaffold a new blog post with correct frontmatter, imports, and structure
argument-hint: "[topic] [tags]"
agent: implementer
---

Create a new blog post for jmrp.io following these steps:

1. **Determine the next number**: Check `src/content/posts/` for the highest numbered file (e.g., `008-*.mdx`) and use the next number (e.g., `009`).

2. **Create the MDX file** at `src/content/posts/NNN-${input:slug}.mdx` using this template:

```mdx
---
title: "${input:title}"
slug: "${input:slug}"
publishedDate: YYYY-MM-DD  # Today's date
description: "SEO description — MUST be ≤ 155 characters"
tags: []
draft: true
---
import TLDRSummary from "@components/ui/TLDRSummary.astro";
import Callout from "@components/ui/Callout.astro";

<TLDRSummary>
Brief summary of the post.
</TLDRSummary>

## Introduction

Content here...

## Section

Content here...

## Conclusion

Content here...
```

3. **Rules to follow**:
   - `description` MUST be ≤ 155 characters (enforced by Playwright tests)
   - Heading hierarchy: h1 (auto from title) → h2 → h3 — never skip levels
   - All images require descriptive `alt` text
   - `<Mermaid>` requires `ariaLabel` prop
   - Import components from `@components/ui/` — see `src/components/ui/AGENTS.md` for full reference
   - No inline styles, no `<script>` tags
   - External links: `rel="external noopener noreferrer"` + `target="_blank"`

4. **Available UI components**: TLDRSummary, Callout, Collapsible, Tabs/TabPanel, Mermaid, Code, FileContent, TerminalCommand, TerminalOutput, TerminalSession, CheckList, StepByStep, BeforeAfter, Table, Timeline, YouTube, and more. See `src/components/ui/AGENTS.md`.
