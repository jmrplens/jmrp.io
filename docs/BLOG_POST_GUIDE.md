# Blog Post Creation Guide

## Quick Start

1. Copy the template file:

   ```bash
   cp src/content/posts/en/_template.mdx src/content/posts/en/013-my-new-post.mdx
   ```

2. Edit the frontmatter with your post details. **Replace `013` with the next available number; the `slug` must start with that same `NNN-` prefix.**

3. Follow the standard opening — cover → a short intro paragraph (the "entradilla") → a `<TLDRSummary>` (before the first `##`) — then write your content using Markdown/MDX.

4. Add the **GEO / structured-data frontmatter** (see below): `articleType`, verified `topics` Q-ids, and a genuine `faq`.

5. Build and preview:

   ```bash
   pnpm dev --host   # live preview (reviewable from another device on the LAN)
   # or, to match production output:
   pnpm run build && pnpm run preview
   ```

> The visible FAQ section, the JSON-LD (TechArticle/FAQPage/HowTo + about/mentions),
> the author bio card, and the References list are rendered automatically from the
> frontmatter by `BlogPost.astro` — you never hand-write `<FAQ>`, `<AuthorCard>`, or
> schema in the MDX body.

## Frontmatter Fields Reference

### Required Fields

| Field           | Type   | Description                   | Example             |
| --------------- | ------ | ----------------------------- | ------------------- |
| `title`         | String | Post title                    | `"My Awesome Post"` |
| `publishedDate` | Date   | Publication date (YYYY-MM-DD) | `2025-12-17`        |

### Optional Fields (Recommended)

| Field         | Type    | Description            | Example                       | Default                 |
| ------------- | ------- | ---------------------- | ----------------------------- | ----------------------- |
| `description` | String  | SEO description & RSS  | `"A brief description..."`    | Uses site description   |
| `author`      | String  | Author name            | `"José Manuel Requena Plens"` | Site author             |
| `authorEmail` | String  | Author email (RFC 822) | `"mail@jmrp.io"`              | `mail@jmrp.io`          |
| `updatedDate` | Date    | Last update date       | `2025-12-18`                  | Same as `publishedDate` |
| `draft`       | Boolean | Hide in production     | `true` or `false`             | `false`                 |
| `coverImage`  | String  | Cover image path       | `"/img/cover.jpg"`            | Default blog image      |
| `tags`        | Array   | Post categories/tags   | `["nginx", "security"]`       | `[]`                    |
| `references`  | Array   | External citations     | See below                     | `[]`                    |

### GEO / Structured-Data Fields

These power the post's Schema.org graph and AI discoverability. Every post should set
`articleType`, `topics`, and `faq`; `howto` is for step-by-step guides.

| Field              | Type   | Description                                                                                             |
| ------------------ | ------ | ------------------------------------------------------------------------------------------------------- |
| `articleType`      | Enum   | `"TechArticle"` for engineering guides (the norm), `"BlogPosting"` (default) for narrative              |
| `proficiencyLevel` | Enum   | `Beginner` / `Intermediate` / `Expert` (optional, emitted on TechArticle)                               |
| `topics`           | Array  | `{ name, wikidata }` — **verified** Wikidata Q-ids → JSON-LD `about` (first) + `mentions` (rest), max 6 |
| `faq`              | Array  | `{ question, answer }` — genuine Q&A → rendered FAQ section + `FAQPage` JSON-LD                         |
| `howto`            | Object | `{ name, totalTime?, tools?[], supplies?[], steps[{ name, text, anchor? }] }` → `HowTo` JSON-LD         |

```yaml
articleType: "TechArticle"
proficiencyLevel: "Intermediate"
topics:
  - name: "Content Security Policy" # first = `about` (primary topic)
    wikidata: "Q1128636"
  - name: "Cross-site scripting" # rest = `mentions`
    wikidata: "Q371199"
faq:
  - question: "Why must the MAC be verified before decrypting?"
    answer: "To avoid a padding oracle — never act on bytes you have not authenticated."
howto: # step-by-step guides only
  name: "Enable mutual TLS on Nginx"
  totalTime: "PT45M"
  steps:
    - name: "Create the certificate authority"
      text: "Generate the root CA key and certificate."
      anchor: "creating-your-certificate-authority" # links to the in-page heading id
```

**Verify every Q-id** before using it — query
`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=<term>&language=en&format=json&limit=5`
and confirm the entity's description matches how you use the topic. A wrong Q-id is worse
than none. The Spanish version of a post uses its own translated `faq` but the **same**
`topics` Q-ids (English Wikidata labels).

### References Format

```yaml
references:
  - text: "Reference Title"
    url: "https://example.com/article"
  - text: "Another Reference"
    url: "https://example.com/another"
```

## Complete Example

```yaml
---
title: "Securing Nginx with Client Certificates (mTLS)"
slug: "001-secure-nginx-client-certificates" # starts with the NNN- prefix
description: "A comprehensive guide on implementing Mutual TLS (mTLS) with Nginx."
author: "José Manuel Requena Plens"
authorEmail: "mail@jmrp.io"
publishedDate: 2025-12-16
draft: false
# coverImage: "/img/nginx-mtls-cover.jpg"  # Optional custom cover
tags: ["nginx", "security", "linux", "certificates", "tutorial"]
articleType: "TechArticle"
proficiencyLevel: "Intermediate"
topics:
  - name: "Mutual authentication"
    wikidata: "Q6944186"
  - name: "Transport Layer Security"
    wikidata: "Q206494"
faq:
  - question: "Do clients need a certificate from a public CA?"
    answer: "No — mTLS uses your own private CA; only your server trusts it."
references:
  - text: "Nginx SSL Module Documentation"
    url: "https://nginx.org/en/docs/http/ngx_http_ssl_module.html"
---
import TLDRSummary from "@components/ui/TLDRSummary.astro";

<TLDRSummary>
Mutual TLS makes Nginx require a client certificate signed by your private CA —
strong, password-less authentication for admin endpoints and APIs.
</TLDRSummary>
```

## Available MDX Components

### Callout

Highlight important information with colored boxes. **These now span the full width of the content.**

```mdx
<Callout
  type="info"
  title="Did you know?"
>
  This is an informational callout with a title.
</Callout>
```

**Available types:**

- `info` - Blue informational box (default)
- `warning` - Yellow warning/highlight
- `error` - Red danger/error box
- `success` - Green success box
- `tip` - Purple helpful tip
- `note` - Gray neutral note

### Tabs

Show multiple content blocks in tabs (e.g., code examples):

````mdx
<Tabs labels={["JavaScript", "Python"]}>
  <TabPanel index={0}>

```javascript
console.log("Hello");
```

  </TabPanel>
  <TabPanel index={1}>

```python
print("Hello")
```

  </TabPanel>
</Tabs>
````

### BeforeAfter

Display "before" vs "after" (e.g. vulnerable vs secure) side-by-side. Useful for
showing security fixes or refactoring. Labels are set via `beforeLabel`/`afterLabel`
and the content goes in the `before` / `after` slots.

````mdx
<BeforeAfter beforeLabel="Vulnerable" afterLabel="Secure">
  <div slot="before">

```javascript
eval(input);
```

  </div>
  <div slot="after">

```javascript
JSON.parse(input);
```

  </div>
</BeforeAfter>
````

### YouTube Embed

Embed YouTube videos responsively (centered, max-width 70ch):

```mdx
<YouTube
  id="dQw4w9WgXcQ"
  title="Video Title"
/>
```

### References Section

Display all references at the end of your post:

```mdx
<References references={frontmatter.references} />
```

### Component Layout Notes

- **Full Width Components:** `Callout`
- **Centered / Width-Restricted Components (70ch):** `Code` blocks, `Tabs`, `BeforeAfter`, `YouTube`, `TerminalCommand`, `TerminalOutput`.

## Content Writing Tips

### Headers

- Use `#` for the main title (already in frontmatter, don't repeat)
- Start content headers with `##` (H2)
- Use `###` for subsections (H3)

### Code Blocks

Specify language for syntax highlighting:

````markdown
```javascript
const greeting = "Hello World";
console.log(greeting);
```
````

### Images

Place images in `public/img/` and reference them:

```markdown
![Alt text](/img/my-image.jpg)
```

### Links

- External links: `[Text](https://example.com)`
- Internal links: `[Text](/blog/other-post)`

## SEO Best Practices

1. **Title**: Keep under 60 characters
2. **Description**: 150-160 characters, include main keywords
3. **Tags**: Use 3-7 relevant tags
4. **Cover Image**: 1200x630px for best social media preview
5. **Alt Text**: Always add descriptive alt text to images

## RSS Feed Integration

All posts are automatically included in the RSS feed at `/rss.xml`:

- Uses `author` and `authorEmail` from frontmatter
- Includes `description` in feed
- Shows all `tags` as categories
- Includes `coverImage` as enclosure if specified

## Schema.org Metadata

Each post automatically generates (all from frontmatter, validated at build via `schema-dts`):

- `TechArticle` (or `BlogPosting`) with headline, dates, `wordCount`, `articleSection`,
  `proficiencyLevel`, `speakable`, and `author`/`publisher` referencing the site `#person`
- `dateModified` — the `updatedDate` when revised, otherwise `publishedDate`
- `about` (primary topic) + `mentions` (rest), each linked to its Wikidata Q-id from `topics`
- `FAQPage` from `faq`, and `HowTo` from `howto`
- `BreadcrumbList` for navigation

## Publishing Checklist

Before publishing your post:

- [ ] `slug` starts with the `NNN-` prefix and is unique
- [ ] Description is under 155 characters
- [ ] **`<TLDRSummary>` near the top** — after the intro paragraph, before the first `##` (the TL;DR answer-target)
- [ ] **`articleType`** set (`TechArticle` for guides)
- [ ] **`topics`** present, each Q-id verified against Wikidata
- [ ] **`faq`** has genuine questions with concise answers
- [ ] `howto` added if the post is a step-by-step guide
- [ ] No two headings share identical text (ambiguous ToC anchors)
- [ ] Author and email are correct; published date is set; draft is `false`
- [ ] Tags are relevant and consistent with existing posts
- [ ] References are properly formatted
- [ ] All images have alt text
- [ ] Code examples have language specified
- [ ] Spanish version (if any) has its own translated `faq` and the SAME `topics` Q-ids
- [ ] External links open in new tab (automatic)
- [ ] Test locally with `pnpm run build && pnpm run preview`
- [ ] Check mobile responsiveness

## File Naming and Ordering

- **Requirement:** Files must start with a 3-digit numeric index to maintain order in the filesystem.
  - Example: `001-post-slug.mdx`
  - Start from `001`, `002`, `003`, etc.
- **Slug:** You **MUST** define the `slug` property in the frontmatter.
  - This ensures the URL remains `/blog/post-slug/` regardless of the file prefix.

## Bilingual Support (EN/ES)

The site is bilingual, but **blog post content is in English only**. The translation system handles all UI chrome around posts:

- **Translated automatically**: Dates, "Published on", "Updated on", "Read more", "Back to Blog", tag labels, ARIA labels, navigation, footer
- **Not translated**: Post body text, code snippets, component content (e.g., Callout text)

### What This Means for Authors

- Write your post content in English
- Code snippets stay in English (universal convention)
- Component props like `title` in `<Callout>` are part of your content — write them in English
- SEO metadata (`title`, `description`) in frontmatter is in English
- The UI around your post will automatically appear in the user's selected language

## Required Frontmatter

```yaml
title: "Post Title"
slug: "post-url-slug" # REQUIRED: Defines the URL
publishedDate: 2025-12-17
```

## Common Mistakes to Avoid

1. ❌ Forgetting to set `draft: false` when ready to publish
2. ❌ Using wrong date format (use `YYYY-MM-DD`)
3. ❌ Not including `description` (impacts SEO)
4. ❌ Invalid email format in `authorEmail`
5. ❌ Absolute paths for images (use `/img/...` not `./public/img/...`)
6. ❌ Repeating the title as H1 in content (already in frontmatter)
7. ❌ Not importing custom components before using them

## Testing

### Local Testing

```bash
# Development server
pnpm run dev

# Production build
pnpm run build
pnpm run preview
```

### Validation

- **RSS Feed**: <https://validator.w3.org/feed/>
- **Schema**: <https://validator.schema.org/>
- **SEO**: <https://pagespeed.web.dev/>

## Need Help?

- Template file: `src/content/posts/en/_template.mdx`
- Frontmatter schema: `src/content.config.ts` (the `posts` collection)
- RSS configuration: `src/pages/rss.xml.ts`
- Post layout & JSON-LD builder: `src/components/pages/BlogPost.astro` (rendered by `src/pages/blog/[...slug].astro`)
- FAQ component: `src/components/ui/FAQ.astro`
- Author card: `src/components/blog/AuthorCard.astro`
- `new-blog-post` skill: `.claude/skills/new-blog-post/SKILL.md`
