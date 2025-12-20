# Blog Post Creation Guide

## Quick Start

1. Copy the template file:

   ```bash
   cp src/content/posts/_template.mdx src/content/posts/my-new-post.mdx
   ```

2. Edit the frontmatter with your post details

3. Write your content using Markdown/MDX

4. Build and preview:
   ```bash
   npm run build
   npm run preview
   ```

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
description: "A comprehensive guide on implementing Mutual TLS (mTLS) with Nginx."
author: "José Manuel Requena Plens"
authorEmail: "mail@jmrp.io"
publishedDate: 2025-12-16
updatedDate: 2025-12-16
draft: false
# coverImage: "/img/nginx-mtls-cover.jpg"  # Optional custom cover
tags: ["nginx", "security", "linux", "certificates", "tutorial"]
references:
  - text: "Nginx SSL Module Documentation"
    url: "https://nginx.org/en/docs/http/ngx_http_ssl_module.html"
---
```

## Available MDX Components

### Callout

Highlight important information with colored boxes:

```mdx
<Callout type="info">This is an informational callout.</Callout>
```

**Available types:**

- `info` - Blue informational box
- `warning` - Yellow warning box
- `danger` - Red danger/error box
- `success` - Green success box

### Code Tabs

Show multiple code examples in tabs:

````mdx
<CodeTabs>
  <CodeTabItem label="JavaScript">
    ```javascript console.log('Hello'); ```
  </CodeTabItem>
  <CodeTabItem label="Python">```python print("Hello") ```</CodeTabItem>
</CodeTabs>
````

### YouTube Embed

Embed YouTube videos responsively:

```mdx
<YouTube id="dQw4w9WgXcQ" title="Video Title" />
```

### References Section

Display all references at the end of your post:

```mdx
<References references={frontmatter.references} />
```

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

````

### Images

Place images in `public/img/` and reference them:

```markdown
![Alt text](/img/my-image.jpg)
````

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

Each post automatically generates:

- `BlogPosting` schema with all metadata
- `BreadcrumbList` for navigation
- References author from main site schema
- Includes publication and modification dates

## Publishing Checklist

Before publishing your post:

- [ ] Title is clear and descriptive
- [ ] Description is under 160 characters
- [ ] Author and email are correct
- [ ] Published date is set
- [ ] Draft is set to `false`
- [ ] Tags are relevant and consistent with existing posts
- [ ] References are properly formatted
- [ ] All images have alt text
- [ ] Code examples have language specified
- [ ] External links open in new tab (automatic)
- [ ] Test locally with `npm run build && npm run preview`
- [ ] Check mobile responsiveness

## File Naming and Ordering

- **Requirement:** Files must start with a 3-digit numeric index to maintain order in the filesystem.
  - Example: `001-post-slug.mdx`
  - Start from `001`, `002`, `003`, etc.
- **Slug:** You **MUST** define the `slug` property in the frontmatter.
  - This ensures the URL remains `/blog/post-slug/` regardless of the file prefix.

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
npm run dev

# Production build
npm run build
npm run preview
```

### Validation

- **RSS Feed**: https://validator.w3.org/feed/
- **Schema**: https://validator.schema.org/
- **SEO**: https://pagespeed.web.dev/

## Need Help?

- Template file: `src/content/posts/_template.mdx`
- Schema definition: `src/content/config.ts`
- RSS configuration: `src/pages/rss.xml.ts`
- Post layout: `src/pages/blog/[...slug].astro`
