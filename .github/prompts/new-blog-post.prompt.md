---
name: new-blog-post
description: Scaffold a new blog post with correct frontmatter, imports, and structure
argument-hint: "[topic] [tags]"
agent: implementer
---

Create a new blog post for jmrp.io following these steps:

1. **Determine the next number**: Check `src/content/posts/en/` for the highest numbered file (e.g., `012-*.mdx`) and use the next number (e.g., `013`). Skip `999-testing-components.mdx` (test fixture).

2. **Create the MDX file** at `src/content/posts/en/NNN-${input:slug}.mdx` using this template:

```mdx
---
title: "${input:title}"
slug: "NNN-${input:slug}"        # MUST start with the NNN- numeric prefix
publishedDate: YYYY-MM-DD        # Today's date
description: "SEO description — MUST be ≤ 155 characters"
tags: []
draft: true
# --- GEO / structured-data fields ---
articleType: "TechArticle"       # technical guide/tutorial; "BlogPosting" for narrative
proficiencyLevel: "Intermediate" # Beginner | Intermediate | Expert (optional)
topics: # Wikidata-linked topics — first = `about`, rest = `mentions` (max 6)
  - name: "Topic Name"
    wikidata: "Q12345"           # VERIFIED bare Q-id
faq: # genuine Q&A about THIS post → rendered FAQ section + FAQPage JSON-LD
  - question: "A real question a reader would ask?"
    answer: "A concise, self-contained answer."
---
import TLDRSummary from "@components/ui/TLDRSummary.astro";
import Callout from "@components/ui/Callout.astro";

<TLDRSummary>
Self-contained summary of the key takeaway (the answer-target).
</TLDRSummary>

## Introduction

Content here...

## Conclusion

Content here...
```

3. **Every post must include** (GEO / structured-data standards):
   - **TL;DR**: open the body with `<TLDRSummary>` (renders as an `<h2>` answer-target) — a self-contained summary, not a "what you'll learn" preview.
   - **`articleType: "TechArticle"`** for engineering guides (default `"BlogPosting"` only for narrative).
   - **`topics`** with Wikidata Q-ids: 1 `about` + up to 5 `mentions`. **Verify each Q-id** resolves to the intended entity via `wbsearchentities` before using it.
   - **`faq`**: genuine reader questions with concise answers (rendered as a collapsible FAQ at the end + `FAQPage` JSON-LD). Only real Q&A.
   - **`howto`** for step-by-step guides: mirror the ordered steps (see the `howto` schema in `content.config.ts`).
   - **Bilingual**: if an `es/` version exists, give it its own translated `faq` and the SAME `topics` Q-ids.

   > The FAQ section, the JSON-LD (TechArticle/FAQPage/HowTo + about/mentions), the author bio card, and the References list are rendered automatically by `BlogPost.astro` from the frontmatter — do NOT add `<FAQ>`, `<AuthorCard>`, or schema by hand.

4. **Content rules**:
   - `description` MUST be ≤ 155 characters (enforced by Playwright tests)
   - Heading hierarchy: h1 (auto from title) → h2 → h3 — never skip levels; avoid two headings with identical text (duplicate ToC entries / ambiguous anchors)
   - All images require descriptive `alt` text; `<Mermaid>` requires `ariaLabel`
   - No inline styles, no `<script>` tags
   - External links: `rel="external noopener noreferrer"` + `target="_blank"` (automatic)

5. **Available UI components**: TLDRSummary, Callout, Collapsible, Tabs/TabPanel, Mermaid, Code, FileContent, TerminalCommand, TerminalOutput, TerminalSession, CheckList, StepByStep, BeforeAfter, Table, Timeline, YouTube, and more. See `src/components/ui/AGENTS.md`. (FAQ and AuthorCard are not imported — they come from frontmatter/layout.)
