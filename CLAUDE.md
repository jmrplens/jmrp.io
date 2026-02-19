# CLAUDE.md - AI Context for jmrp.io

> **Purpose**: Comprehensive context for Claude, Copilot, Gemini, and other AI agents working on this codebase.
> **Last verified**: February 2026 (Astro 6.0.0-beta.11, UnoCSS 66.6.0)

## Project Overview

**jmrp.io** is a personal technical blog and portfolio built with **Astro 6** (SSG), focusing on:

- **Zero client-side JavaScript** except for progressive enhancement islands
- **Bilingual (EN/ES)** with Astro's built-in i18n routing
- **WCAG 2.2 AA/AAA accessibility** compliance (axe-core tested)
- **100/100 PageSpeed scores** on all metrics
- **Content Security Policy (CSP)** with nonce-only strategy
- **Optimal CLS** — no layout shifts, proper sizing for all elements

### Core Principles

1. **WCAG 2.2 AA compliance** (AAA when possible) — All components must pass axe-core
2. **Zero-JS client-side** — No JavaScript unless absolutely necessary (islands pattern)
3. **Updated packages** — Use latest versions including beta/alpha
4. **Optimal CLS** — No layout shifts, proper sizing for all elements
5. **No duplicate resources** — UnoCSS deduplicates icons globally
6. **Dark-first theme** — Default is dark mode, light mode is the override
7. **Privacy-first tools** — All interactive tools run client-side only

---

## Tech Stack

| Layer           | Technology               | Version        |
| --------------- | ------------------------ | -------------- |
| Framework       | Astro                    | 6.0.0-beta.11  |
| Content         | MDX                      | 5.0.0-beta.7   |
| Styling         | UnoCSS (presetWind4)     | ^66.6.0        |
| Islands         | Preact                   | ^10.28.3       |
| Diagrams        | Mermaid + mermaid-isomorphic | ^11.12.2 / ^3.0.4 |
| Math            | rehype-mathjax (SSR)     | ^7.1.0         |
| Syntax          | Shiki                    | ^3.22.0        |
| Testing         | Playwright + Axe-core    | ^1.58.2        |
| Icons           | Iconify (12 collections) | @iconify-json/* |
| Package Manager | pnpm                     | >=10           |
| Node            | Required                 | >=22.12.0      |

---

## Project Structure

```plaintext
/
├── src/
│   ├── content/                # Content Collections (MDX, YAML, BibTeX)
│   │   ├── posts/              # Blog posts (MDX, numbered: 001-slug.mdx)
│   │   ├── tools/              # Interactive tools (MDX)
│   │   ├── cv/                 # Resume data (main.yaml)
│   │   ├── publications_data/  # papers.bib + coauthors.yaml
│   │   └── site_config/        # site.yaml + socials.yaml
│   ├── content.config.ts       # Collection schemas (Zod)
│   ├── types.ts                # Global TypeScript types
│   ├── components/
│   │   ├── apps/               # Interactive tools (vanilla JS, no Preact)
│   │   ├── ui/                 # 35 reusable UI components
│   │   ├── layout/             # BaseHead, Header, Footer, ToC
│   │   ├── homelab/            # Preact islands (InfrastructureInsights, ServiceStats)
│   │   ├── blog/               # PostCard, PostGrid, TagCloud
│   │   ├── cv/                 # CV-specific components
│   │   ├── github/             # GitHubSearch, RepoCard
│   │   └── publications/       # PublicationItem
│   ├── pages/                  # File-based routing
│   ├── layouts/                # BaseLayout, ToolLayout
│   ├── styles/                 # Global CSS, design tokens
│   ├── integrations/
│   │   ├── pre-build/          # Avatar fetch, beacon setup
│   │   └── post-build/         # CSP, compression, HTML minify
│   ├── utils/                  # Shared utilities
│   └── languages/              # Custom Shiki grammars (RouterOS)
├── scripts/
│   ├── ci/                     # 20 CI automation scripts
│   └── *.mjs                   # Development tools (11 scripts)
├── tests/                      # 12 Playwright test suites + utils
├── docs/                       # Extended documentation
├── public/                     # Static assets (favicons, llms.txt, PDFs)
└── dist/                       # Build output (atomic swap deployment)
```

---

## Content Collections

### `posts` — Blog Posts (MDX)

```yaml
title: string # Required
slug: string # Required
publishedDate: Date # Required (YYYY-MM-DD)
updatedDate: Date # Optional
description: string # Optional (≤ 155 chars for SEO)
author: string # Optional
authorEmail: string # Optional
draft: boolean # Default: false
tags: string[] # Default: []
coverImage: ImageMeta # Optional (relative image)
```

File naming: `001-post-slug.mdx`. Files starting with `_` are excluded.

### `tools` — Interactive Tools (MDX)

```yaml
title: string # Required
slug: string # Required
description: string # Required (≤ 155 chars)
subtitle: string # Optional
icon: string # UnoCSS class (e.g. "i-mdi:shield-lock-outline")
category: enum # "security" | "developer" | "network" | "embedded" | "mikrotik"
tags: string[] # Default: []
appComponent: string # Maps to component in componentMap (e.g. "CSPBuilder")
appProps: Record # Extra props passed to the component
publishedDate: Date # Optional
updatedDate: Date # Optional
```

14 tools: `base64-encoder`, `cert-inspector`, `color-contrast-checker`, `cron-builder`, `csp-builder`, `hash-calculator`, `http-headers-analyzer`, `modbus-frame-builder`, `nginx-config-generator`, `password-generator`, `regex-tester`, `subnet-calculator`, `timestamp-converter`, `wireguard-config-generator`.

### `site_config` — Discriminated Union

**`type: "site"` (site.yaml)**: `title`, `description`, `author`, `url`, `keywords`, `fediverse_creator`, `locale`, `name`, `jobTitle`, `social[]`, `person`, `social_links[]`, `theme_color`, `background_color`, `twitter_creator`, `logo_text`, `nav[]`, `hero { title, subtitle, bio[] }`, `featured_projects[]`, `shortcuts[]`.

**`type: "socials"` (socials.yaml)**: `github_username`, `linkedin_username`, `mastodon_username`, `scholar_userid`, `matrix_id`, `work_url`, `custom_social[]`.

### `cv` — Resume Data (YAML)

Array of sections with discriminated union by `type`:

- **`map`**: Key-value items with optional links
- **`time_table`**: Timeline items (title, institution, department, location, year, summary)
- **`list_groups`**: Skill groups with categories, icons, and levels
- **`certificate_list`**: Certificate groups with school, time, links

### `publications_data` — Academic Papers

- `papers.bib`: BibTeX entries parsed via `citation-js`
- `coauthors.yaml`: Map of co-author surnames → name variants + profile URLs

---

## Tools Architecture

### Routing

- `/tools/` → `tools/index.astro` (grouped by category, ordered: security=1, developer=2, network=3, embedded=4, mikrotik=5)
- `/tools/[slug]/` → `tools/[...slug].astro` (static `componentMap` maps `appComponent` → imported component)
- `/tools/categories/[category]` → category filter pages

### ToolLayout Props

```typescript
{ title, description, subtitle?, icon, slug, extraSchema? }
```

Auto-generates `SoftwareApplication` JSON-LD. Slots: `default` (tool component), `info` (MDX documentation).

### App Components (NOT Preact)

Located in `src/components/apps/`. Each is **Astro-only** using `<script is:inline>` with DOM manipulation via `data-*` attributes. IDs generated with `crypto.getRandomValues()`. Examples: `CSPBuilder.astro` (2213 lines), `HashCalculator.astro` (577 lines).

> **Important**: Tools do NOT use Preact. Preact islands are used **exclusively** in `src/components/homelab/` for real-time data (InfrastructureInsights, ServiceStats).

---

## Layouts

### BaseLayout

```typescript
interface Props {
  title: string;
  description?: string;
  type?: string; // "website" | "article" | "profile"
  schema?: Record<string, unknown> | Record<string, unknown>[];
  image?: string;
  noIndex?: boolean; // Default: false — outputs <meta name="robots" content="noindex, follow">
  publishDate?: Date;
  modifiedDate?: Date;
  authors?: string[];
  tags?: string[];
}
```

Includes: BaseHead, Header, Footer, SRIEventListener, skip link, theme toggle script with MutationObserver, View Transitions handlers (`astro:before-swap` / `astro:after-swap`).

### ToolLayout

```typescript
interface Props {
  title: string;
  description: string;
  subtitle?: string;
  icon: string; // UnoCSS icon class
  slug: string;
  extraSchema?: Record<string, unknown>;
}
```

---

## SEO & Metadata System (BaseHead)

```typescript
interface Props {
  title: string;
  description?: string;
  image?: string | ImageMetadata;
  type?: string; // Default: "website"
  noIndex?: boolean; // Default: false
  publishDate?: Date;
  modifiedDate?: Date;
  authors?: string[];
  tags?: string[];
  schema?: Record<string, unknown> | Record<string, unknown>[];
}
```

### Key Behaviors

- **Title truncation**: ≤65 chars with progressive fallback (`title | author` → `title | JMRP` → `title`)
- **OG Image**: Optimized to WebP 1200×630 via `getImage()`. Default: `mehome_landscape.webp`
- **Fonts**: Geist Sans + Geist Mono via Astro Fonts API, CSS vars `--font-geist-sans`, `--font-geist-mono`
- **Favicons**: WebP + PNG (32×32), Apple Touch Icon (180×180)
- **Cloudflare Analytics**: `cf-beacon.js` injected only in production with `PUBLIC_CF_BEACON_TOKEN`

### JSON-LD Schema System

Generates `@graph` array with automatic schemas:

1. **WebSite** — `@id: #website`, publisher as Person with `sameAs` social links
2. **SiteNavigationElement** — One item per nav entry in site config
3. **BreadcrumbList** — Auto-generated from `Astro.url.pathname`
4. **Page-specific** — Merged from `schema` prop (BlogPosting, SoftwareApplication, ProfilePage, etc.)

All JSON-LD wrapped in `safeJsonLd()` — escapes `<`, `>`, `&`, `\u2028`, `\u2029` to prevent XSS.

---

## CSS Design System

### Files

- `src/styles/global.css` (542 lines): Variables, theme, Shiki, typography
- `src/styles/blog.css`: Blog post styles
- `src/styles/rss.css`, `skills.css`: RSS, CV styles
- `src/styles/components/`: Homelab component styles

### Design Tokens (CSS Custom Properties)

**Theme (Dark-first)**:

```css
/* Dark (default) */
--color-bg: #000;
--color-bg-secondary: #0d1117;
--color-bg-subtle: rgb(255 255 255 / 5%);
--color-text: #c9d1d9;
--color-text-muted: #8b949e;
--color-text-heading: #fff;
--color-primary: #b389f5;
--color-primary-hover: #c49af5;
--color-on-primary: #000;
--color-accent: #b389f5;
--color-border: #30363d;
--color-bg-header: rgb(255 255 255 / 3%);

/* Light (override) */
--color-bg: #fff;
--color-bg-secondary: #f6f8fa;
--color-bg-subtle: rgb(0 0 0 / 5%);
--color-text: #24292f;
--color-text-muted: #57606a;
--color-text-heading: #1f2328;
--color-primary: #b509ac;
--color-primary-hover: #d11cd1;
--color-on-primary: #fff;
--color-accent: #b509ac;
--color-border: #d0d7de;
--color-bg-header: #eaeff2;
```

**Typography**: `--font-body: var(--font-geist-sans)`, `--font-mono: var(--font-geist-mono)`. Weights: `--fw-normal` (400), `--fw-medium` (500), `--fw-semibold` (600), `--fw-bold` (700), `--fw-extrabold` (800).

**Border radii**: `--radius-sm` (4px), `--radius-md` (8px), `--radius-lg` (16px).

**Borders**: `--border-1: 1px solid var(--color-border)`, `--border-2: 2px solid var(--color-border)`.

**Spacing**: `--space-xs` (0.25rem), `--space-sm` (0.5rem), `--space-md` (1rem), `--space-md-lg` (1.5rem), `--space-lg` (2rem), `--space-lg-xl` (3rem), `--space-xl` (4rem).

**Layout**: `--header-height: 64px`, `--max-width-container: 1200px`, `--max-width-prose: 70ch`.

**Z-indices**: `--z-fab: 900`, `--z-header: 1000`, `--z-backdrop: 1010`, `--z-drawer: 1020`.

**Theme switching**: Dark-first with `@media (prefers-color-scheme: light)` override and `:root[data-theme="light/dark"]` explicit toggle.

---

## UI Components (35 total)

### Content & Summary

| Component     | Import                             | Key Props                                                          |
| ------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `TLDRSummary` | `@components/ui/TLDRSummary.astro` | Slot content                                                       |
| `Callout`     | `@components/ui/Callout.astro`     | `type: "info"\|"warning"\|"error"\|"success"\|"tip"\|"note"\|"keypoint"\|"important"`, `title?` |
| `Collapsible` | `@components/ui/Collapsible.astro` | `title`, `open?`                                                   |

### Status & Version

| Component          | Import                                  | Key Props                                                   |
| ------------------ | --------------------------------------- | ----------------------------------------------------------- |
| `StateNotice`      | `@components/ui/StateNotice.astro`      | `type: "deprecated"\|"mandatory"\|"experimental"\|"preview"\|"breaking"\|"security"` |
| `VersionBadge`     | `@components/ui/VersionBadge.astro`     | `version`, `status?`                                        |
| `SecurityRating`   | `@components/ui/SecurityRating.astro`   | Rating display                                              |
| `DeprecatedNotice` | `@components/ui/DeprecatedNotice.astro` | Deprecation banner                                          |

### Lists & Steps

| Component      | Import                              | Key Props                                                 |
| -------------- | ----------------------------------- | --------------------------------------------------------- |
| `CheckList`    | `@components/ui/CheckList.astro`    | Item attr: `data-check="check\|cross\|warning\|optional"` |
| `StepByStep`   | `@components/ui/StepByStep.astro`   | `title`                                                   |
| `Prerequisite` | `@components/ui/Prerequisite.astro` | Prerequisites list                                        |

### Documentation

| Component       | Import                               | Key Props               |
| --------------- | ------------------------------------ | ----------------------- |
| `DirectiveCard` | `@components/ui/DirectiveCard.astro` | Directive documentation |
| `APIEndpoint`   | `@components/ui/APIEndpoint.astro`   | API endpoint docs       |
| `KeyValue`      | `@components/ui/KeyValue.astro`      | Key-value display       |

### Comparison & Decision

| Component      | Import                              | Key Props                                             |
| -------------- | ----------------------------------- | ----------------------------------------------------- |
| `BeforeAfter`  | `@components/ui/BeforeAfter.astro`  | `beforeLabel`, `afterLabel`, slots: `before`, `after` |
| `DecisionTree` | `@components/ui/DecisionTree.astro` | Decision flow                                         |

### Code & Terminal

| Component         | Import                                                                                                      | Key Props                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `Code`            | `@components/ui/Code.astro`                                                                                 | `lang`, `title`, `showLineNumbers`, `highlight` |
| `FileContent`     | `@components/ui/FileContent.astro`                                                                          | `filename`, `language`, `collapsible`           |
| `TerminalCommand` | `@components/ui/TerminalCommand.astro`                                                                      | `title`, `prompt`                               |
| `TerminalOutput`  | `@components/ui/TerminalOutput.astro`                                                                       | Output display                                  |
| `TerminalSession` | `{ TerminalSession, TerminalSessionCommand, TerminalSessionOutput }` from `@components/ui/terminal-session` | Multi-command sessions                          |

### Visual & Data

| Component        | Import                                | Key Props                                                  |
| ---------------- | ------------------------------------- | ---------------------------------------------------------- |
| `Mermaid`        | `@components/ui/Mermaid.astro`        | `caption`, `maxWidth`, `maxHeight`, `ariaLabel` (required) |
| `BarChart`       | `@components/ui/BarChart.astro`       | Chart data                                                 |
| `BrowserSupport` | `@components/ui/BrowserSupport.astro` | `browsers: BrowserInfo[]`                                  |
| `Table`          | `@components/ui/Table.astro`          | `title`, `striped`, `highlight`                            |
| `Timeline`       | `@components/ui/Timeline.astro`       | Timeline events                                            |

### Tabs

| Component       | Import                                          | Key Props                    |
| --------------- | ----------------------------------------------- | ---------------------------- |
| `Tabs/TabPanel` | `{ Tabs, TabPanel }` from `@components/ui/tabs` | `label: string` for TabPanel |

### Media & Other

| Component          | Import                                  | Key Props                         |
| ------------------ | --------------------------------------- | --------------------------------- |
| `YouTube`          | `@components/ui/YouTube.astro`          | `id`, `title`                     |
| `References`       | `@components/ui/References.astro`       | Auto-collected from content links |
| `CopyButton`       | `@components/ui/CopyButton.astro`       | Copy-to-clipboard                 |
| `IconDetector`     | `@components/ui/IconDetector.astro`     | Icon consistency check            |
| `SRIEventListener` | `@components/ui/SRIEventListener.astro` | SRI integrity for event listeners |
| `ThemeToggle`      | `@components/ui/ThemeToggle.astro`      | Theme switcher                    |

### Barrel Exports

- `tabs.ts`: Re-exports `Tabs` + `TabPanel`
- `terminal-session.ts`: Re-exports `TerminalSession` + `TerminalSessionCommand` + `TerminalSessionOutput`

### Documentation

- **Full component docs**: `src/components/ui/README.md`
- **Agent quick reference**: `src/components/ui/AGENTS.md`
- **Blog writing guide**: `docs/BLOG_POST_GUIDE.md`
- **Accessibility guide**: `docs/ACCESSIBILITY_GUIDE.md`

---

## Utility Functions

| File                 | Exports                                                     | Purpose                                              |
| -------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| `blog.ts`            | `getUniqueTags(posts)`                                      | Unique tags with counts, sorted by frequency         |
| `content.ts`         | `stripExtension(entry)`                                     | Clean file extensions for collection IDs             |
| `cv.ts`              | `getCVData()`                                               | Read/parse CV from `src/content/cv/main.yaml`        |
| `github.ts`          | `GitHubRepo`, `GitHubProfile`, fetch fns                    | GitHub API interfaces + optional `GITHUB_TOKEN`      |
| `html.ts`            | `stripHtml()`, `sanitize()`, `escapeHtml()`, `safeJsonLd()` | HTML sanitization (sanitize-html + he)               |
| `icons-extractor.ts` | `extractIcons(data)`                                        | Recursive icon field extraction for UnoCSS           |
| `icons.ts`           | `iconMap`                                                   | 60+ language/extension → Iconify icon mappings       |
| `publications.ts`    | `PublicationItem`, `PublicationGroup`                       | BibTeX parsing via citation-js, co-author enrichment |
| `shiki.ts`           | `resolveShikiLanguage()`, `getHighlighter()`                | Singleton Shiki highlighter, RouterOS custom grammar |
| `site.ts`            | `getSiteUrl()`, `getAbsoluteUrl(path)`                      | URL construction from `import.meta.env.SITE`         |

### Global Types (`src/types.ts`)

```typescript
(SiteConfig,
  SocialsConfig,
  CVData,
  CVSection,
  CVSkillGroup,
  CVCertificateGroup);
```

---

## UnoCSS Configuration

### Presets

```typescript
presetWind4({ preflights: { reset: false } });
presetIcons({
  prefix: "i-",
  extraProperties: { display: "inline-block", "vertical-align": "middle" },
});
```

### Icon Collections (12)

`mdi`, `logos`, `simple-icons`, `devicon`, `carbon`, `tabler`, `heroicons`, `lucide`, `fa-solid`, `fa-brands`, `fa-regular`, `vscode-icons`

> Note: `@iconify-json/marketeq` is installed but NOT in the `iconCollections` extractor array.

### Icon Pattern

```html
<span class="i-{collection}:{icon-name}"></span>
```

### Custom Extractors

- `icon-extractor`: Detects `collection:name` patterns in YAML/MDX without `i-` prefix
- Safelist in `uno.config.ts` for dynamically generated icons (Timeline, BrowserSupport, file types)

---

## Build System

### Build Command (Atomic Swap)

```bash
pnpm build
# Internally: build → dist_new → swap → dist (zero-downtime)
```

### Pre-Build Integrations

| Integration | Purpose                             |
| ----------- | ----------------------------------- |
| `avatar.ts` | Fetches GitHub avatar with fallback |
| `beacon.ts` | Cloudflare beacon analytics setup   |

### Post-Build Pipeline (Sequential)

1. `extractCssDataUris()` — CSS data URI extraction to physical files
2. `processHtmlFiles()` — SRI integrity hashes, nonce attributes, inline style → class, data URI extraction, HTML minification
3. `finalizeCspConfig()` — Generates `security_headers.conf` + `security_headers_assets.conf` for Nginx
4. `optimizeImages()` — Image optimization (PNG, JPEG, WebP, AVIF)
5. `compressAssets()` — Gzip + Brotli pre-compression
6. `fixPermissions()` + `deploySecurityHeaders()` — Copy headers to Nginx path + reload (if configured)
7. `purgeCloudflareCache()` — Purge via API (if configured)

### Vite Plugin: Prefetch Nonce

`vite-plugin-prefetch-nonce.ts` — Patches Astro's `appendSpeculationRules` to inject nonce on dynamic speculation rules, preventing CSP violations.

### CSP Strategy: Nonce-Only

Nginx replaces `NGINX_CSP_NONCE` placeholder with `$cspNonce` per-request. Two header files:

- `security_headers.conf`: For HTML (nonce in script-src + style-src + strict-dynamic)
- `security_headers_assets.conf`: For static assets (default-src 'none', no nonces)

Additional security headers: HSTS (2 years), X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, COOP, COEP, CORP, Permissions-Policy (18 features disabled).

---

## Markdown/Rehype Pipeline

### Remark Plugins

- `remarkMath` — LaTeX math blocks
- `remarkMermaidBypass` — Transforms `mermaid-render` blocks to `<pre class="mermaid">`

### Rehype Plugins

- `rehypeMathjax` — MathJax SSR rendering
- `rehypeMermaid` — Mermaid SSR (inline-svg strategy with theme variables)
- `rehypeRaw` — Allow raw HTML in MDX
- `rehypeExternalLinks` — `rel="external noopener noreferrer"`, `target="_blank"`
- `rehypeLinkDisambiguator` — Auto aria-labels for links with same text but different destinations

### Custom Shiki Language

RouterOS grammar at `src/languages/routeros.tmLanguage.json`. Aliases: `routeros`, `mikrotik`, `rsc`.

---

## Astro Configuration Highlights

```javascript
experimental: { clientPrerender: true, contentIntellisense: true, chromeDevtoolsWorkspace: true }
prefetch: { prefetchAll: true, defaultStrategy: "viewport" }
i18n: { defaultLocale: "en", locales: ["en", "es"] }
build: { inlineStylesheets: "always", concurrency: 2 }
// Image: remote patterns for Google favicons, responsiveStyles: true
// Vite: chunkSizeWarningLimit: 1000, SSR external: citation-js
// Fonts: Geist Sans + Geist Mono via fontsource, optimizedFallbacks: true
```

---

## Internationalization (i18n)

### Architecture

Bilingual support (EN/ES) using Astro's built-in i18n routing with a custom translation layer.

| Layer | File(s) | Purpose |
|-------|---------|---------|
| Config | `src/i18n/config.ts` | `Locale` type, `defaultLocale`, `localeConfig` |
| Translations | `src/i18n/translations/{en,es}/{common,tools}.ts` | All UI strings (~460 keys each in common, ~1350 in tools) |
| Utils | `src/i18n/utils.ts` | `useTranslations()`, `formatDate()`, `pluralize()`, path helpers |
| Barrel | `src/i18n/index.ts` | Re-exports everything |

### URL Structure

- **English (default)**: `/blog/`, `/tools/`, `/cv` — no prefix
- **Spanish**: `/es/blog/`, `/es/tools/`, `/es/cv` — prefixed
- **`hreflang` alternates**: Auto-generated via `getAlternateLinks()` in `BaseHead.astro`
- **Language switcher**: `LanguageSwitcher.astro` in header, uses `useTranslatedPath()`

### Translation Pattern

```astro
---
import { getLangFromUrl, useTranslations } from "@i18n/utils";
const locale = getLangFromUrl(Astro.url);
const t = useTranslations(locale);
---
<nav aria-label={t("aria.mainNav")}>{t("nav.home")}</nav>
<p>{t("ui.backTo", { page: "Blog" })}</p>
```

### Key Functions

| Function | Purpose |
|----------|---------|
| `getLangFromUrl(url)` | Extract locale from URL pathname |
| `useTranslations(locale)` | Returns `t(key, params?)` with fallback to EN |
| `useTranslatedPath(locale)` | Returns `translatePath(path, target?)` for localized URLs |
| `stripLocalePrefix(path)` | Remove `/es/` prefix from paths |
| `getAlternateLinks(pathname, siteUrl)` | Generate hreflang alternate URLs |
| `formatDate(date, locale)` | Locale-aware date formatting via `Intl` |
| `formatNumber(num, locale)` | Locale-aware number formatting via `Intl` |
| `pluralize(count, forms, locale)` | Plural form selection via `Intl.PluralRules` |

### Translation File Structure

```typescript
// src/i18n/translations/en/common.ts
export const common = {
  nav: { home: "Home", blog: "Blog", ... },
  ui: { skipToContent: "Skip to content", backTo: "← Back to {page}", ... },
  aria: { mainNav: "Main Navigation", ... },
  blog: { publishedOn: "Published on {date}", ... },
  seo: { titleSuffix: "JMRP", ... },
  footer: { copyright: "© {year}", ... },
  pages: { github: { ... }, cv: { ... }, ... },
};
```

### Client-Side i18n

For `<script>` blocks that need translated strings, inject via `data-*` attributes:

```astro
<article data-code-fallback={t("pages.blogPost.codeFallback")}>
  ...
</article>
<script>
  const article = document.querySelector("article");
  const fallback = article?.getAttribute("data-code-fallback") ?? "Code";
</script>
```

### Adding a New Translation Key

1. Add the key to `src/i18n/translations/en/common.ts` (or `tools.ts` for tool-specific)
2. Add the Spanish translation to `src/i18n/translations/es/common.ts` (or `tools.ts`)
3. Use `t("section.key")` in the component
4. For interpolation: `t("key", { param: value })` with `{param}` in the translation string

### Content i18n

Blog posts and tools content are **not currently translated** — MDX files exist only in English. The translation system covers all UI chrome, navigation, SEO metadata, schemas, and ARIA labels.

---

## Routing

| Route                     | File                                | Purpose                                               |
| ------------------------- | ----------------------------------- | ----------------------------------------------------- |
| `/`                       | `index.astro`                       | Homepage (EN)                                         |
| `/es/`                    | `index.astro`                       | Homepage (ES)                                         |
| `/blog/`                  | `blog/index.astro`                  | Blog listing                                          |
| `/blog/[slug]/`           | `blog/[...slug].astro`              | Blog post (auto-collects all references from content) |
| `/blog/tags/[tag]/`       | `blog/tags/[tag].astro`             | Posts filtered by tag                                 |
| `/cv`                     | `cv.astro`                          | Curriculum Vitae                                      |
| `/github`                 | `github.astro`                      | GitHub profile + repos                                |
| `/homelab`                | `homelab.astro`                     | Self-hosted infrastructure                            |
| `/publications`           | `publications.astro`                | Academic publications (BibTeX)                        |
| `/tools/`                 | `tools/index.astro`                 | Tools index (grouped by category)                     |
| `/tools/[slug]/`          | `tools/[...slug].astro`             | Individual tool page                                  |
| `/tools/categories/[cat]` | `tools/categories/[category].astro` | Tools by category                                     |
| `/404`                    | `404.astro`                         | Error page (noIndex)                                  |
| `/rss.xml`                | `rss.xml.ts`                        | RSS 2.0 feed (custom XML with enclosures, media)      |
| `/site.webmanifest`       | `site.webmanifest.ts`               | PWA manifest                                          |

> All routes above (except RSS, webmanifest, 404) also exist under `/es/` prefix for Spanish.

---

## Testing

### Test Suites (12 files)

| Suite                            | Purpose                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| `accessibility.spec.ts`          | Axe-core WCAG 2.1 AA per-page (light + dark themes)        |
| `deep.accessibility.spec.ts`     | Semantic landmarks, keyboard, heading order, copy buttons  |
| `keyboard.accessibility.spec.ts` | Menu, skip link, mobile menu, theme toggle navigation      |
| `tabs.accessibility.spec.ts`     | Zero-JS radio group keyboard nav, FileContent focus        |
| `functional.spec.ts`             | Theme toggle/persistence, mobile menu, per-page functional |
| `integration.spec.ts`            | Cross-page navigation flows, content verification          |
| `security.spec.ts`               | CSP/SRI per-page verification, build output checks         |
| `seo.spec.ts`                    | Meta tags, OG/Twitter, JSON-LD, robots.txt, RSS, llms.txt  |
| `performance.spec.ts`            | LCP, lazy loading, preloads, reduced motion, broken links  |
| `prerender.spec.ts`              | Speculation rules injection, CSP compliance                |
| `icons.spec.ts`                  | UnoCSS icon consistency per-page                           |
| `global-setup.ts`                | Pre-generates page cache from sitemap for parallel tests   |
| `global-teardown.ts`             | Cleanup after test runs                                    |

### Playwright Config

3 projects: `functional` (Desktop Chrome), `mobile-functional` (Pixel 5), `accessibility` (Desktop Chrome, 30s timeout). WebServer: `pnpm astro preview` on port 4321. Permissions: clipboard-read/write.

### Test Utils

- `sitemap.ts`: `getCachedPages()`, `getPagesFromSitemap()`, `getSitemapUrls()`, `filterPagesByLocale()`
- `accessibility.ts`: `aggregateAxeResults()`, report generation
- `filters.ts`: `shouldIgnoreError()` — filters expected localhost errors
- `index.ts`: Barrel re-exports
- `types.ts`: Shared test type definitions

---

## Scripts

### Development (`scripts/`)

| Script                          | Purpose                                                 |
| ------------------------------- | ------------------------------------------------------- |
| `run-verify.mjs`                | Full QA pipeline orchestrator                           |
| `verify-icons.mjs`              | UnoCSS icon consistency in dist/                        |
| `csp-reporter.mjs`              | CSP violation receiver + Telegram notifications         |
| `audit-aria-labels.mjs`         | Accessibility name audit on built HTML                  |
| `optimize-favicons.mjs`         | Favicon generation from source with sharp               |
| `preview-rss.mjs`               | RSS feed HTML preview                                   |
| `rehype-link-disambiguator.mjs` | Rehype plugin: auto aria-labels for ambiguous links     |
| `remark-mermaid-bypass.mjs`     | Remark plugin: mermaid-render → `<pre class="mermaid">` |
| `run-lighthouse-audit.mjs`      | Lighthouse audits against localhost/production          |
| `test-mermaid.mjs`              | Verify mermaid-isomorphic SSR works                     |

### CI (`scripts/ci/`)

20 scripts: bundle analysis, accessibility/Lighthouse/schema/HTML/image/link reports, JSDoc coverage, SonarQube issues, RSS validation, schema validation, CI dashboard generation, PR comment updates, deployment cleanup, health score calculation, deploy report.

---

## CI/CD Pipeline

### Workflow (`.github/workflows/ci.yml`)

```
ci-setup → build → [parallel quality checks] → [parallel tests] → reporting
```

### Quality Checks (12 parallel jobs)

`astro check`, Prettier, ESLint, pnpm audit, Stylelint, JSDoc coverage, Lychee (links), CSpell, SonarQube, bundle size, HTML validation, RSS validation.

### Tests

Playwright E2E (functional + accessibility + Lighthouse). Accessibility and Lighthouse use `LOCALE_FILTER` env var to split workload by locale (EN/ES) in CI matrices, doubling parallelism.

### SonarCloud Manual Consultation

```bash
# Check open issues and security hotspots
SONAR_PROJECT_KEY=jmrplens_jmrp.io node scripts/ci/get-sonar-issues.mjs

# Run full scanner analysis
pnpm exec sonar-scanner
```

- **Dashboard**: `https://sonarcloud.io/dashboard?id=jmrplens_jmrp.io`
- **Project key**: `jmrplens_jmrp.io` | **Organization**: `jmrplens`
- **Config**: `sonar-project.properties` (sources, exclusions, rule suppressions)
- **IDE**: SonarLint connected mode in `.vscode/settings.json`
- **Script**: `scripts/ci/get-sonar-issues.mjs` — queries issues + TO_REVIEW hotspots, checks `NOSONAR` suppressions

---

## Environment Variables

| Variable                        | Context  | Purpose                              |
| ------------------------------- | -------- | ------------------------------------ |
| `PUBLIC_SITE_URL`               | Public   | Canonical site URL                   |
| `PUBLIC_CF_BEACON_TOKEN`        | Public   | Cloudflare Analytics token           |
| `PRIVATE_CF_API_TOKEN`          | Secret   | Cloudflare API for cache purge       |
| `PRIVATE_CF_EMAIL`              | Secret   | Cloudflare email                     |
| `PRIVATE_CF_ZONE_ID`            | Secret   | Cloudflare zone ID                   |
| `POSTBUILD_NGINX_SNIPPETS_PATH` | Secret   | Path to deploy security_headers.conf |
| `POSTBUILD_NGINX_CONFIG_PATH`   | Secret   | Nginx config path for verification   |
| `POSTBUILD_NGINX_CACHE_PATH`    | Secret   | Nginx cache path to clear            |
| `POSTBUILD_NGINX_RELOAD_TIMEOUT`| Secret   | Timeout for Nginx reload (ms)        |
| `POSTBUILD_NGINX_TEST_TIMEOUT`  | Secret   | Timeout for Nginx test (ms)          |
| `GITHUB_TOKEN`                  | Optional | GitHub API rate limit increase       |
| `SONAR_TOKEN`                   | Optional | SonarCloud API token (CI + manual)   |
| `SONAR_PROJECT_KEY`             | Optional | SonarCloud project (`jmrplens_jmrp.io`) |
| `TELEGRAM_BOT_TOKEN`            | Server   | CSP reporter Telegram bot            |
| `TELEGRAM_CHAT_ID`              | Server   | CSP reporter Telegram chat           |
| `LOCALE_FILTER`                 | CI/Test  | Filter test pages by locale (`en` or `es`). Used in accessibility and Lighthouse CI matrices |

---

## Config Files

### TypeScript Path Aliases (`tsconfig.json`)

```
@components/* → src/components/*    @assets/*     → src/assets/*
@layouts/*    → src/layouts/*       @utils/*      → src/utils/*
@styles/*     → src/styles/*        @data/*       → src/data/*
@languages/*  → src/languages/*     @src/*        → src/*
```

JSX: `react-jsx` with `jsxImportSource: "preact"`. Extends: `astro/tsconfigs/strict`.

### Prettier (`.prettierrc`)

`semi: true`, `singleQuote: false`, `tabWidth: 2`, `trailingComma: "all"`, `printWidth: 80`, `singleAttributePerLine: true`. Plugin: `prettier-plugin-astro`.

### Stylelint (`.stylelintrc.json`)

Extends: `stylelint-config-standard`, `stylelint-config-recess-order`, `stylelint-config-html`. Rules: kebab-case BEM selectors, `color-named: never`, `max-nesting-depth: 4`.

### ESLint (`eslint.config.mjs`)

12 plugins: `@gorazdo/preact`, `@unocss`, `astro` (recommended + jsx-a11y), `jsdoc`, `no-secrets`, `playwright`, `react-hooks`, `simple-import-sort`, `sonarjs`, `unicorn`, `typescript-eslint`.

---

## Deployment

No Docker. Direct SSG deployment on the production server:

- **Project root**: `/var/www/jmrp.io/`
- **Nginx document root**: `/var/www/jmrp.io/dist/` — Nginx serves this directory directly as `jmrp.io`
- **Build output**: `pnpm build` uses atomic swap (`dist_new` → `dist_old` → `dist`) for zero-downtime deploys
- **Live update**: Running `pnpm build` on the server immediately updates the live website — no git push, CI pipeline, or separate deploy step is needed

Steps:

1. `pnpm build` → `dist/` (atomic swap: `dist_new` → `dist_old` → `dist`)
2. Post-build copies `security_headers.conf` to Nginx snippets path
3. Verifies Nginx config (`nginx -t`) and reloads
4. Purges Cloudflare cache via API
5. CSP Reporter runs as separate service (`scripts/csp-reporter.mjs`)

---

## Development Commands

```bash
pnpm dev              # Start dev server (port 4321)
pnpm build            # Production build (atomic swap)
pnpm preview          # Preview production build
pnpm verify           # FULL QA pipeline — 14 steps (run before PR)
pnpm typecheck        # astro check
pnpm lint             # ESLint
pnpm lint:css         # Stylelint
pnpm lint:html        # HTML5 validation (requires build)
pnpm test:e2e         # Playwright tests
pnpm test:e2e --ui    # Playwright interactive mode
pnpm verify-icons     # Check icon consistency
pnpm exec cspell lint . # Spell check (bilingual EN/ES)
pnpm exec prettier --check .  # Format check (runs at end of build)
```

> ⚠️ **CRITICAL**: Stop `astro dev` before running `pnpm verify` or tests. The dev server lacks nonces/SRI, causing security tests to fail.
>
> ```bash
> pkill -f "astro dev" 2>/dev/null; pnpm verify
> ```

### `pnpm verify` Pipeline Detail (`scripts/run-verify.mjs`)

14 sequential steps, fail-fast (except SonarCloud):

1. **Astro Check** — `pnpm typecheck --minimumFailingSeverity warning`
2. **ESLint** — `pnpm lint --max-warnings=0`
3. **Prettier** — `pnpm exec prettier --check .`
4. **Stylelint** — `pnpm lint:css`
5. **Production Build** — `pnpm run build` (includes pre-build + post-build integrations)
6. **HTML5 Validation** — `pnpm lint:html`
7. **RSS Feed Validation** — `node scripts/ci/validate-rss.mjs dist`
8. **Schema.org JSON-LD** — `node scripts/ci/validate-schema.mjs dist`
9. **Spelling (CSpell)** — `pnpm exec cspell lint .`
10. **Broken Links (Lychee)** — `lychee --config lychee.toml --root-dir dist dist/**/*.html`
11. **JSDoc Coverage** — `node scripts/ci/calculate-jsdoc-coverage.mjs`
12. **SonarCloud Analysis** — `pnpm exec sonar-scanner` *(conditional: requires `SONAR_TOKEN`)*
13. **SonarCloud Issues** — `node scripts/ci/get-sonar-issues.mjs` *(conditional: requires `SONAR_TOKEN` + `SONAR_PROJECT_KEY`)*
14. **Playwright E2E** — `pnpm test:e2e`

Steps 6-14 require a prior build. Steps 12-13 are skipped without env vars. Pre-run cleanup: removes `schema-report.json`, `html-validation.json`, `rss-validation.json`.

---

## Writing Blog Posts

1. Copy `src/content/posts/_template.mdx`
2. Rename with numbered prefix: `009-my-post.mdx`
3. Update frontmatter (title, slug, publishedDate, tags, description ≤ 155 chars)
4. Import needed components
5. Write content with MDX
6. References auto-collected from markdown links + HTML `<a>` tags in content

### Component Usage in MDX

````mdx
import Callout from "@components/ui/Callout.astro";
import { Tabs, TabPanel } from "@components/ui/tabs";
import Mermaid from "@components/ui/Mermaid.astro";

<Callout
  type="warning"
  title="Important"
>
  Critical information here.
</Callout>

<Tabs>
  <TabPanel label="Bash">```bash sudo nginx -t ```</TabPanel>
</Tabs>

<Mermaid caption="Request Flow" ariaLabel="Diagram showing request flow">
flowchart LR
    A[Request] --> B{Valid?}
    B -->|Yes| C[Allow]:::success
    B -->|No| D[Block]:::danger
</Mermaid>
````

### Mermaid Node Classes

`.success` (green), `.warning` (yellow), `.danger` (red), `.info` (blue), `.highlight` (purple), `.secondary` (gray).

---

## Accessibility Requirements

### WCAG Compliance

- All images: descriptive `alt` text
- Interactive elements: keyboard accessible
- Color contrast: ≥4.5:1 (AA), ≥7:1 (AAA target)
- No color-only indicators
- Heading hierarchy: h1 → h2 → h3
- ARIA labels for complex widgets
- Focus indicators visible
- `prefers-reduced-motion` support

### Component-Specific

| Component         | Requirement                      |
| ----------------- | -------------------------------- |
| `Mermaid`         | `ariaLabel` required             |
| `Table`           | Semantic `<thead>`, `<th scope>` |
| `TerminalCommand` | `aria-label` for copy button     |
| `Collapsible`     | `aria-expanded` state            |
| `Tabs`            | ARIA tabs pattern                |

---

## SEO System

- **robots.txt**: 17+ AI bots + 6 search engine bots explicitly allowed, Sitemap reference, llms.txt references
- **Sitemap**: Auto-generated with filter (excludes /404, test pages) and `lastmod`
- **RSS**: Custom RSS 2.0 with atom:link, enclosures, media:content/thumbnail, channel image
- **JSON-LD**: @graph pattern on all pages, page-specific schemas (BlogPosting, SoftwareApplication, ProfilePage, CollectionPage)
- **Meta descriptions**: All ≤ 155 chars, validated by Playwright tests
- **noIndex**: 404 page excluded from indexing
- **llms.txt/llms-full.txt**: LLM context files (llmstxt.org standard)

---

## WebMCP (Experimental — `feat/webmcp` branch)

### Overview

Implementation of the [WebMCP proposal](https://webmachinelearning.github.io/webmcp/) — a W3C draft spec that exposes site functionality as "tools" invocable by browser-based AI agents via `navigator.modelContext`. No browser implements it yet; the code uses progressive enhancement (feature detection everywhere).

### Architecture

- **Zero npm dependencies** — pure vanilla JS/TS
- **Non-structural** — designed for easy removal (4 new files + marked blocks)
- **Progressive enhancement** — only activates if `navigator.modelContext` exists

### Files (all removable)

| File | Purpose |
|------|---------|
| `src/types/webmcp.ts` | TypeScript interfaces for the WebMCP API |
| `src/utils/webmcp.ts` | Safe wrapper functions with feature detection |
| `src/utils/webmcp-tools.ts` | Tool catalog organized by page context (~480 lines) |
| `src/components/layout/WebMCPProvider.astro` | Astro component injected in BaseLayout |
| `public/.well-known/webmcp.json` | Static manifest for agent discovery (30 tools) |

### Modified files (minimal changes)

| File | Change |
|------|--------|
| `src/layouts/BaseLayout.astro` | +3 lines (import + `<WebMCPProvider />`) |
| `src/components/layout/BaseHead.astro` | +1 line (`<link rel="webmcp-manifest">`) |
| `src/components/apps/*.astro` | WebMCP block in each of 14 tool scripts |
| `public/llms.txt`, `public/llms-full.txt` | WebMCP section |

### Tool categories (30 total)

- **Site-wide (6)**: theme toggle, get theme, navigate, page info, language switch, site navigation
- **Blog (3)**: list posts, search posts, get post tags
- **CV (2)**: summary, section (generic by heading name)
- **Publications (2)**: list, search
- **Tools index (1)**: list available tools
- **App tools (16)**: One per interactive tool (hash, base64 encode, base64 decode, subnet, password, timestamp, regex, contrast, cron, CSP, cert, headers, Modbus, Nginx, WireGuard, tester)

### Removal instructions

1. Delete: `src/types/webmcp.ts`, `src/utils/webmcp.ts`, `src/utils/webmcp-tools.ts`, `src/components/layout/WebMCPProvider.astro`, `public/.well-known/webmcp.json`
2. Remove import + `<WebMCPProvider />` from `BaseLayout.astro` (~3 lines)
3. Remove `<link rel="webmcp-manifest">` from `BaseHead.astro` (~1 line)
4. Remove `// === WebMCP START ===` to `// === WebMCP END ===` blocks from each app component
5. Remove WebMCP sections from `llms.txt` and `llms-full.txt`

---

## Anti-Patterns (Avoid)

1. **❌ Inline `<script>` tags** — Breaks CSP, use data attributes or `<script is:inline>` only in app components
2. **❌ Inline styles** — Use UnoCSS classes
3. **❌ getElementById/querySelector in .astro** — Prefer CSS-only or islands pattern
4. **❌ Fixed pixel widths** — Use responsive units (%, rem, ch)
5. **❌ Missing alt text** — Always describe images
6. **❌ Color-only indicators** — Add icons or text
7. **❌ Duplicate icon classes** — UnoCSS handles deduplication
8. **❌ Hardcoded dark mode colors** — Use CSS custom properties
9. **❌ Large bundle dependencies** — Prefer smaller alternatives
10. **❌ Ignoring CLS** — Always size images/embeds
11. **❌ Meta descriptions > 155 chars** — Google truncates, tests enforce this
12. **❌ Preact in tools** — Tools use vanilla JS via `<script is:inline>`
13. **❌ Missing `ariaLabel` on Mermaid** — Required for accessibility
14. **❌ Hardcoded English strings in components** — Use `t()` from `useTranslations()` for all UI text

---

## AI Context Files

### VS Code Copilot (`.github/`)

| File                                     | Purpose                                          |
| ---------------------------------------- | ------------------------------------------------ |
| `.github/copilot-instructions.md`        | Always-on coding conventions                     |
| `.github/instructions/*.instructions.md` | File-scoped instructions (4 files, `applyTo`)    |
| `.github/prompts/*.prompt.md`            | Reusable slash commands (5 files)                |
| `.github/agents/*.agent.md`              | Custom agents: planner, implementer, reviewer    |
| `.github/skills/*/SKILL.md`             | Agent skills: astro-build, accessibility-audit, csp-debug |
| `.github/hooks/*.json`                   | Lifecycle hooks: auto-format, protect-files      |

### Claude Code (`.claude/`)

| File                                     | Purpose                                          |
| ---------------------------------------- | ------------------------------------------------ |
| `.claude/settings.json`                  | Permissions, denied ops, hooks                   |
| `.claude/skills/*/SKILL.md`             | Skills: astro-build, accessibility-audit, csp-debug |
| `.claude/rules/*.md`                     | Path-scoped rules (4 files, `paths` frontmatter) |

> **Note**: Agents are only defined in `.github/agents/` to avoid duplicates in VS Code's agent picker (VS Code reads both `.github/agents/` and `.claude/agents/`).

### Cross-Platform

| File                                     | Purpose                                          |
| ---------------------------------------- | ------------------------------------------------ |
| `CLAUDE.md`                              | Primary AI context (this file) — VS Code + Claude Code |
| `CLAUDE.local.md`                        | Personal overrides (gitignored)                  |
| `GEMINI.md`                              | Quick reference for Google Gemini                |
| `src/components/ui/AGENTS.md`            | UI component quick reference for agents          |
| `src/components/apps/AGENTS.md`          | Interactive tools reference for agents           |

### Documentation

| File                                     | Purpose                                          |
| ---------------------------------------- | ------------------------------------------------ |
| `docs/BLOG_POST_GUIDE.md`               | Blog writing guide                               |
| `docs/ACCESSIBILITY_GUIDE.md`           | Accessibility requirements                       |
| `docs/I18N_GUIDE.md`                    | Internationalization guide                       |
| `docs/CSP_REPORTER.md`                  | CSP violation reporter documentation             |
| `public/llms.txt`                        | LLM site context (llmstxt.org)                   |
| `public/llms-full.txt`                   | Detailed LLM context                             |
| `AI_CONFIG_TASKS.md`                     | AI configuration task checklist                  |
