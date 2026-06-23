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

Path: `src/content/posts/en/NNN-your-slug.mdx`. Use `src/content/posts/en/_template.mdx`
as the base. A complete, GEO-optimized post carries this frontmatter:

```mdx
---
title: "Post Title"
slug: "NNN-post-slug"            # MUST start with the NNN- numeric prefix
publishedDate: 2025-01-15
description: "SEO description — must be ≤ 155 characters"
tags: ["tag1", "tag2"]
draft: true
# --- GEO / structured-data fields (see "What every post must include") ---
articleType: "TechArticle"       # technical guide/tutorial; "BlogPosting" for narrative
proficiencyLevel: "Intermediate" # Beginner | Intermediate | Expert (optional)
topics:                          # Wikidata-linked topics — first = about, rest = mentions
  - name: "Topic Name"
    wikidata: "Q12345"           # VERIFIED bare Q-id
faq:                             # genuine Q&A about THIS post → FAQ section + FAQPage JSON-LD
  - question: "A real question a reader would ask?"
    answer: "A concise, self-contained answer."
---
import TLDRSummary from "@components/ui/TLDRSummary.astro";
import Callout from "@components/ui/Callout.astro";

A short intro paragraph (the "entradilla") that frames the problem and why it matters.

<TLDRSummary>
  One-paragraph, self-contained summary of the key takeaway (the answer-target).
</TLDRSummary>

## Introduction

...

## Conclusion

...
```

> The visible **FAQ section, the `TechArticle`/`FAQPage`/`HowTo` JSON-LD, the
> `about`/`mentions` topic linking, the author bio card, and the References list are
> all rendered automatically by `BlogPost.astro` from the frontmatter** — do NOT add
> `<FAQ>`, `<AuthorCard>`, or hand-written schema in the MDX body.

## What every post must include

These are required for the site's GEO / accessibility / structured-data standards:

1. **TL;DR** — every post includes a `<TLDRSummary>` near the top, after a short
   intro paragraph (the "entradilla") and before the first `##` heading. It renders
   as an `<h2>` answer-target that AI engines extract — make it a self-contained
   summary of the conclusion, not a "what you'll learn" preview. (Consistent
   format across the blog: cover → intro → TL;DR → body.)
2. **`articleType`** — set `"TechArticle"` for engineering guides/tutorials (the
   norm here); leave the default `"BlogPosting"` only for narrative/opinion posts.
3. **`topics` (Wikidata Q-ids)** — 1 primary (`about`) + up to 5 secondary
   (`mentions`), max 6. Each `{ name, wikidata }`. **Verify every Q-id** resolves to
   the intended entity before using it (a wrong Q-id is worse than none):
   `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=<term>&language=en&format=json&limit=5`
4. **`faq`** — a handful of genuine questions a reader would ask, with concise
   self-contained answers. Rendered as a collapsible FAQ at the end + emitted as
   `FAQPage` JSON-LD. Only real Q&A — never padding.
5. **`howto`** (step-by-step guides only) — mirror the post's ordered steps into a
   `HowTo` graph node (`name`, optional `totalTime` ISO-8601, `tools`, `supplies`,
   and `steps[] { name, text, anchor }`). The visible steps stay in the body.
6. **Bilingual parity** — when a Spanish version exists (`src/content/posts/es/NNN-*.mdx`),
   it carries its OWN `faq` (translated) and the SAME `topics` Q-ids (English Wikidata
   labels, identical Q-ids in both locales).

## Frontmatter rules

| Field | Constraint |
|-------|-----------|
| `title` | Required |
| `slug` | Required — must start with the `NNN-` numeric prefix, unique across posts |
| `publishedDate` | Required — format `YYYY-MM-DD` |
| `description` | Recommended — **≤ 155 characters** (enforced by `content-integrity.spec.ts`) |
| `draft` | `true` while writing; remove or set `false` to publish |
| `tags` | Optional array of lowercase strings |
| `updatedDate` | Optional — set when revising a published post (emits a real `dateModified`; otherwise `dateModified` falls back to `publishedDate`) |
| `coverImage` | Optional — relative image (rendered as an AVIF+WebP `<picture>`) |
| `articleType` | `"TechArticle"` (guides) or `"BlogPosting"` (default) |
| `proficiencyLevel` | Optional — `Beginner` / `Intermediate` / `Expert` |
| `topics` | `[{ name, wikidata }]` — verified Q-ids; first = `about`, rest = `mentions` |
| `faq` | `[{ question, answer }]` — genuine Q&A |
| `howto` | Step-by-step guides only — see schema in `content.config.ts` |

## Content rules

- **Heading hierarchy**: h1 is auto-generated from `title` — start content at h2, then h3. Never skip levels. Avoid two headings with identical text (duplicate ToC entries / ambiguous anchors).
- **All images** require descriptive `alt` text
- **`<Mermaid>`** requires `ariaLabel` prop
- **No `<script>` tags** in MDX — breaks CSP
- **No inline styles** — use UnoCSS classes
- **External links**: `rel="external noopener noreferrer"` + `target="_blank"` (applied automatically by rehype plugin)
- **Inline cross-links**: link to a sibling post when the body genuinely references its subject (improves topical authority); never force it
- **Blog content is English only** — UI chrome is translated, post body is not
- **References** are auto-collected from markdown links and `<a>` tags; add explicit ones in the frontmatter `references:` array

## Available UI components

Import from `@components/ui/`. See `src/components/ui/AGENTS.md` for the full reference
with props tables and examples. Commonly used in posts:

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

> `FAQ` and `AuthorCard` are NOT imported in posts — they are rendered by the layout
> from the `faq` frontmatter and the site author data.

## Step 3 — Verify

```bash
# Frontmatter constraints (description length, slug uniqueness, etc.)
pnpm test:e2e tests/content-integrity.spec.ts

# Full build check — also validates the JSON-LD (TechArticle/FAQPage/HowTo/topics)
# against Schema.org via schema-dts types
pnpm build
```

## Draft workflow

1. Create the file with `draft: true`
2. `pnpm dev --host` to preview (review from another device on the LAN via its IP)
3. Write and iterate; add `faq` + `topics` once the content is settled
4. Set `draft: false` (or remove the field) when ready to publish
5. Run `pnpm verify` before committing

## Full reference

See `docs/BLOG_POST_GUIDE.md` for the complete blog writing guide.
