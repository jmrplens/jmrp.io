---
name: new-blog-post
description: Scaffold and write a new MDX blog post. Use when asked to create a blog post, write an article, or add content to the posts collection.
argument-hint: "[topic] [tags]"
---

# New Blog Post Skill

Create a new MDX blog post for jmrp.io.

## Step 1 — Determine the next file number

```bash
ls src/content/posts/en/ | grep -E '^[0-9]{3}-' | sort | tail -3
```

Take the highest number and increment by 1. Skip `999-testing-components.mdx` — that is
a permanent test fixture, not a real post.

## Step 2 — Create the file

Path: `src/content/posts/en/NNN-your-slug.mdx`

Use the template at `src/content/posts/en/_template.mdx` as the base. Minimum required
frontmatter:

```mdx
---
title: "Post Title"
slug: "post-slug"
publishedDate: 2025-01-15
description: "SEO description — must be ≤ 155 characters"
tags: ["tag1", "tag2"]
draft: true
---
import TLDRSummary from "@components/ui/TLDRSummary.astro";
import Callout from "@components/ui/Callout.astro";

<TLDRSummary>
  One-paragraph summary of the post.
</TLDRSummary>

## Introduction

...

## Conclusion

...
```

## Frontmatter rules

| Field | Constraint |
|-------|-----------|
| `title` | Required |
| `slug` | Required — must be unique across all posts |
| `publishedDate` | Required — format `YYYY-MM-DD` |
| `description` | Optional but recommended — **≤ 155 characters** (enforced by `content-integrity.spec.ts`) |
| `draft` | Set `true` while writing; remove or set `false` to publish |
| `tags` | Optional array of lowercase strings |
| `updatedDate` | Optional — set when revising a published post |
| `coverImage` | Optional — path relative to `public/` |

## Content rules

- **Heading hierarchy**: h1 is auto-generated from `title` — start content at h2, then h3. Never skip levels.
- **All images** require descriptive `alt` text
- **`<Mermaid>`** requires `ariaLabel` prop
- **No `<script>` tags** in MDX — breaks CSP
- **No inline styles** — use UnoCSS classes
- **External links**: `rel="external noopener noreferrer"` + `target="_blank"` (applied automatically by rehype plugin)
- **Blog content is English only** — UI chrome is translated, post body is not
- **References** are auto-collected from markdown links and `<a>` tags; add explicit ones in frontmatter `references:` array

## Available UI components

Import from `@components/ui/`. See `src/components/ui/AGENTS.md` for full reference with
props tables and examples.

Commonly used in posts:

```mdx
import TLDRSummary from "@components/ui/TLDRSummary.astro";
import Callout from "@components/ui/Callout.astro";
import Collapsible from "@components/ui/Collapsible.astro";
import { Tabs, TabPanel } from "@components/ui/tabs";
import { TerminalSession, TerminalSessionCommand, TerminalSessionOutput } from "@components/ui/terminal-session";
import Code from "@components/ui/Code.astro";
import FileContent from "@components/ui/FileContent.astro";
import TerminalCommand from "@components/ui/TerminalCommand.astro";
import Mermaid from "@components/ui/Mermaid.astro";
import Table from "@components/ui/Table.astro";
import CheckList from "@components/ui/CheckList.astro";
import StepByStep from "@components/ui/StepByStep.astro";
import BeforeAfter from "@components/ui/BeforeAfter.astro";
import StateNotice from "@components/ui/StateNotice.astro";
```

## Step 3 — Verify

```bash
# Check description length and frontmatter constraints
pnpm test:e2e tests/content-integrity.spec.ts

# Full build check (catches MDX syntax errors)
pnpm build
```

## Draft workflow

1. Create file with `draft: true`
2. Run `pnpm dev` to preview at `http://localhost:4321`
3. Write and iterate
4. Set `draft: false` (or remove the field) when ready to publish
5. Run `pnpm verify` before committing

## Full reference

See `docs/BLOG_POST_GUIDE.md` for the complete blog writing guide.
