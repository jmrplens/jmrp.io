# CLAUDE.md - AI Context for jmrp.io

> **Purpose**: Comprehensive context for Claude, Copilot, Gemini, and other AI agents working on this codebase.
> **Last verified**: June 2026 (Astro 7.0.2, Vite 8.1 / Rolldown, UnoCSS 66.7.2, pnpm 11)

## Project Overview

**jmrp.io** is a personal technical blog and portfolio built with **Astro 7** (SSG), focusing on:

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
| Framework       | Astro                    | 7.0.2          |
| Bundler         | Vite (Rolldown)          | ^8.1.0         |
| Content         | MDX                      | 7.0.0          |
| Styling         | UnoCSS (presetWind4)     | ^66.7.2        |
| Islands         | Preact                   | ^10.29.2       |
| Diagrams        | Mermaid + mermaid-isomorphic | ^11.15.0 / ^3.1.0 |
| Syntax          | Shiki                    | ^4.2.0         |
| Testing         | Playwright + Axe-core    | ^1.60.0 / ^4.12.1 |
| Icons           | Iconify (12 collections) | @iconify-json/* |
| Package Manager | pnpm                     | >=11           |
| Node            | Required                 | >=24.0.0 (LTS) |

---

## Project Structure

```plaintext
/
├── src/
│   ├── content/                # Content Collections (MDX, YAML, BibTeX)
│   │   ├── posts/              # Blog posts (MDX, numbered: 001-slug.mdx)
│   │   │   ├── en/             # English posts
│   │   │   └── es/             # Spanish posts
│   │   ├── tools/              # Interactive tools (MDX)
│   │   ├── cv/                 # Resume data (main.yaml)
│   │   ├── publications_data/  # papers.bib + coauthors.yaml
│   │   └── site_config/        # site.yaml + socials.yaml
│   ├── content.config.ts       # Collection schemas (Zod)
│   ├── types.ts                # Global TypeScript types
│   ├── components/
│   │   ├── apps/               # Interactive tools (vanilla JS, no Preact)
│   │   ├── ui/                 # 53 reusable UI components
│   │   ├── layout/             # BaseHead, Header, Footer, ToC
│   │   ├── homelab/            # Preact islands (InfrastructureInsights, ServiceStats)
│   │   ├── blog/               # PostCard, PostGrid, TagCloud
│   │   ├── cv/                 # CV-specific components
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
│   ├── ci/                     # ~13 CI automation scripts
│   └── *.mjs                   # Development + deploy tools (deploy-swap, deploy-live, etc.)
├── tests/                      # 17 Playwright test suites + utils
├── docs/                       # Extended documentation
├── public/                     # Static assets (favicons, llms.txt, PDFs)
└── dist/                       # Build output (atomic swap deployment)
```

---

## Content Collections

### `posts` — Blog Posts (MDX)

```yaml
title: string # Required
slug: string # Required — must start with the NNN- numeric prefix
publishedDate: Date # Required (YYYY-MM-DD)
updatedDate: Date # Optional (else dateModified falls back to publishedDate)
description: string # Optional (≤ 155 chars for SEO)
author: string # Optional
authorEmail: string # Optional
draft: boolean # Default: false
tags: string[] # Default: []
coverImage: ImageMeta # Optional (relative image → AVIF+WebP <picture>)
# --- GEO / structured-data fields ---
articleType: "BlogPosting" | "TechArticle" # Default: BlogPosting (use TechArticle for guides)
proficiencyLevel: "Beginner" | "Intermediate" | "Expert" # Optional (TechArticle)
topics: { name: string; wikidata: string }[] # Wikidata Q-ids → about (first) + mentions (rest), max 6
faq: { question: string; answer: string }[] # → FAQ section + FAQPage JSON-LD
howto: # Optional — step-by-step guides → HowTo JSON-LD
  { name, totalTime?, tools?[], supplies?[], steps[{ name, text, anchor? }] }
```

File naming: `001-post-slug.mdx`. Files starting with `_` are excluded.

> **GEO baseline (every post):** includes a `<TLDRSummary>` near the top — after a
> short intro paragraph (the "entradilla"), before the first `##` (the TL;DR
> answer-target, rendered as `<h2>`; consistent format: cover → intro → TL;DR →
> body); sets `articleType: "TechArticle"` for guides; carries verified
> `topics` Q-ids and a genuine `faq`. The **FAQ section, the JSON-LD (TechArticle/
> FAQPage/HowTo + `about`/`mentions`), the author bio card (`AuthorCard`), and the
> References list are emitted automatically by `BlogPost.astro`** from the frontmatter —
> never hand-add `<FAQ>`/`<AuthorCard>`/schema in MDX. Spanish posts carry their own
> translated `faq` and the SAME `topics` Q-ids. Verify Q-ids via the Wikidata
> `wbsearchentities` API before use.

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
- **Fonts**: Space Grotesk (display) + IBM Plex Sans (body) + IBM Plex Mono (mono) via Astro Fonts API (`fontProviders.fontsource()`), CSS vars `--font-space-grotesk`, `--font-ibm-plex-sans`, `--font-ibm-plex-mono`
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

**Typography**: `--font-display: var(--font-space-grotesk)` (headings, large numbers, card titles), `--font-body: var(--font-ibm-plex-sans)` (paragraphs, UI text), `--font-mono: var(--font-ibm-plex-mono)` (kickers, code, data, the logo). Weights: `--fw-normal` (400), `--fw-medium` (500), `--fw-semibold` (600), `--fw-bold` (700), `--fw-extrabold` (800).

**Border radii**: `--radius-sm` (4px), `--radius-md` (8px), `--radius-lg` (16px).

**Borders**: `--border-1: 1px solid var(--color-border)`, `--border-2: 2px solid var(--color-border)`.

**Spacing**: `--space-xs` (0.25rem), `--space-sm` (0.5rem), `--space-md` (1rem), `--space-md-lg` (1.5rem), `--space-lg` (2rem), `--space-lg-xl` (3rem), `--space-xl` (4rem).

**Layout**: `--header-height: 64px`, `--max-width-container: 1200px`, `--max-width-prose: 70ch`.

**Z-indices**: `--z-fab: 900`, `--z-header: 1000`, `--z-backdrop: 1010`, `--z-drawer: 1020`.

**Theme switching**: Dark-first with `@media (prefers-color-scheme: light)` override and `:root[data-theme="light/dark"]` explicit toggle.

---

## UI Components (53 total)

### Content & Summary

| Component     | Import                             | Key Props                                                          |
| ------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `TLDRSummary` | `@components/ui/TLDRSummary.astro` | Slot content (TL;DR answer-target — near the top of every post, after the intro) |
| `FAQ`         | `@components/ui/FAQ.astro`         | `items: {question,answer}[]`, `open?` — usually wired from the `faq` frontmatter (renders FAQ + FAQPage JSON-LD), not imported in MDX |
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
| `CodeBlock`       | `@components/ui/CodeBlock.astro`                                                                            | `lang` — bare highlight, no chrome (for TabPanel) |
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

### Diagram & Embedded

Zero-JS, theme-aware, responsive SVG/CSS diagrams for systems/embedded/C++/networking. All render `role="img"` with i18n `aria-label` (keys under `components.*`). Prefer these over `Mermaid` for the structured cases; keep `Mermaid` for arbitrary graphs.

| Component         | Import                                  | Key Props                                                        |
| ----------------- | --------------------------------------- | --------------------------------------------------------------- |
| `MemoryMap`       | `@components/ui/MemoryMap.astro`        | `bars[]`, `scale: "shared"\|"fill"` — memory region bars        |
| `StructPacking`   | `@components/ui/StructPacking.astro`    | `members[]`, `arch: "32-bit"\|"64-bit"` — padding + `sizeof`    |
| `RegisterMap`     | `@components/ui/RegisterMap.astro`      | `fields[] {name,bits}`, `width` — register bit-fields           |
| `ByteFrame`       | `@components/ui/ByteFrame.astro`        | `fields[] {label,bytes,variable?}` — single-row byte layout     |
| `PacketDiagram`   | `@components/ui/PacketDiagram.astro`    | `fields[] {name,bits}`, `bitsPerRow` — RFC multi-row header     |
| `SubnetSplit`     | `@components/ui/SubnetSplit.astro`      | `ip`, `prefix` — IP network/host split + facts                  |
| `BitwiseOp`       | `@components/ui/BitwiseOp.astro`        | `a`, `op`, `b?`, `width` — bitwise op bit-by-bit                 |
| `NumberBases`     | `@components/ui/NumberBases.astro`      | `value`, `bits` — hex/dec/oct/bin                               |
| `FloatLayout`     | `@components/ui/FloatLayout.astro`      | `value`, `precision` — IEEE 754 bit layout                      |
| `TimingDiagram`   | `@components/ui/TimingDiagram.astro`    | `signals[] {name,wave,data?}` — WaveDrom-subset SVG waveforms   |
| `EncodingDiagram` | `@components/ui/EncodingDiagram.astro`  | `rows[] {label,bytes[]}` — token → bytes (UTF-8/base64)         |
| `DeltaCompare`    | `@components/ui/DeltaCompare.astro`     | `rows[] {label,before,after}`, `unit` — before/after metrics    |
| `LayerStack`      | `@components/ui/LayerStack.astro`       | `layers[] {name,note?}` — stacked HW/SW layers                  |
| `CallStack`       | `@components/ui/CallStack.astro`        | `frames[] {name,detail?}` — call frames + growth                |
| `Matrix`          | `@components/ui/Matrix.astro`           | `rows`, `cols`, `cells[][]`, `highlight?` — labelled 2-D grid   |
| `Pipeline`        | `@components/ui/Pipeline.astro`         | `stages[] {name,note?,via?}` — numbered stages + data-flow      |
| `ForkJoin`        | `@components/ui/ForkJoin.astro`         | `before?[]`, `branches[]`, `after?[]` — fork→join data-flow     |
| `ThemeImage`      | `@components/ui/ThemeImage.astro`       | `src` or `srcLight`+`srcDark`, `alt` — light/dark image swap    |
| `FileDownload`    | `@components/ui/FileDownload.astro`     | `href`, `filename`, `size?` — download card                     |

### Barrel Exports

- `tabs.ts`: Re-exports `Tabs` + `TabPanel`
- `terminal-session.ts`: Re-exports `TerminalSession` + `TerminalSessionCommand` + `TerminalSessionOutput`

### Component Documentation

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

### Build Command (Blue/Green Symlink Swap)

```bash
pnpm build
# package.json "build" wiring:
#   pnpm run build:cv
#   && DIST_DIR=$(node scripts/deploy-swap.mjs prepare)   # picks builds/blue or builds/green (whichever is inactive), empties it
#   && astro build --outDir $DIST_DIR                      # Astro builds straight into that dir; post-build hooks run here
#   && node scripts/deploy-swap.mjs swap $DIST_DIR          # atomically retargets the `dist` symlink (ln -sfn + mv -T / rename(2))
#   && node scripts/deploy-live.mjs                         # publish actions AFTER the swap (see Deployment below)
```

`dist` is a symlink to `builds/blue` or `builds/green` (never a real directory once bootstrapped) — Nginx always resolves it to a fully-built tree, so there's no window where `dist/` is empty or half-written. `scripts/deploy-swap.mjs` also auto-migrates a legacy real `dist/` directory into `builds/<color>` the first time it runs.

> ⚠️ No lock guards concurrent builds — running `pnpm build` twice in parallel on the same worktree can race on `deploy-swap.mjs prepare`/`swap`. Not currently an issue (builds are triggered manually/serially), but don't script concurrent invocations without adding one.

### Pre-Build Integrations

| Integration | Purpose                             |
| ----------- | ----------------------------------- |
| `beacon.ts` | Cloudflare beacon analytics setup   |

### Post-Build Pipeline (`astro:build:done`, `src/integrations/post-build.ts`)

Runs **inside** the build, before the swap — it only transforms the not-yet-live `builds/<color>` output. Each step is wrapped in a `timed()` helper (`src/integrations/timing.ts`) that logs `⏱ {step}: {seconds}s` for baseline telemetry.

1. `extractCssDataUris()` — CSS data URI extraction to physical files
2. `processHtmlFiles()` — SRI integrity hashes, nonce attributes, inline style → class, data URI extraction, HTML minification
3. `finalizeCspConfig()` — Generates `security_headers.conf` + `security_headers_assets.conf` for Nginx
4. `optimizeImages()` + `compressAssets()` **run concurrently** (`Promise.all`) — they touch disjoint file sets (PNG re-optimization vs gzip/Brotli over js/css/svg/json/xml/txt). Both are backed by a content-hash (SHA-256) cache under `.cache/postbuild-png*` / `.cache/postbuild-compression*`, keyed by a config signature so a settings/dependency change invalidates stale cache entries instead of serving them forever.
5. `fixPermissions()` — chown/chmod for Nginx (`www-data`), only if `POSTBUILD_NGINX_SNIPPETS_PATH` is set

> **Publish actions moved out**: copying `security_headers*.conf` to the system Nginx path + `nginx -t` + reload, and the Cloudflare cache purge, no longer run inside this hook (pre-swap). They now run from `scripts/deploy-live.mjs`, invoked by `pnpm build` *after* `deploy-swap.mjs` has retargeted `dist/` — see Deployment below.

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

- `remarkMermaidBypass` — Transforms `mermaid-render` blocks to `<pre class="mermaid">`

### Rehype Plugins

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
// Fonts: Space Grotesk + IBM Plex Sans + IBM Plex Mono via fontsource, optimizedFallbacks: true
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
  pages: { projects: { ... }, cv: { ... }, ... },
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
| `/projects`               | `projects.astro`                    | Curated open-source projects                          |
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

### Test Suites (17 files)

| Suite                            | Purpose                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| `accessibility.spec.ts`          | Axe-core WCAG 2.2 AA per-page (light + dark themes)        |
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
| `content-integrity.spec.ts`      | Frontmatter validation, description length, slug uniqueness |
| `edge-cases.spec.ts`             | 404 handling, malformed URLs, edge inputs                  |
| `i18n.spec.ts`                   | EN/ES routing, translated strings, locale switching        |
| `schema-validation.spec.ts`      | JSON-LD schema correctness per page type                   |
| `tools.functional.spec.ts`       | Interactive tool input/output behavior                     |
| `ui-components.spec.ts`          | UI component rendering and prop validation                 |
| `global-setup.ts`                | Pre-generates page cache from sitemap for parallel tests   |
| `global-teardown.ts`             | Cleanup after test runs                                    |

### Playwright Config

5 projects: `functional` (Desktop Chrome — functional/integration/seo/prerender/security/icons/i18n/tools/schema/content-integrity/ui-components/edge-cases specs), `performance` (Desktop Chrome, 60s timeout, 1-2 retries — `performance.spec.ts` split out so its LCP/lazy-loading assertions aren't starved by the rest of the suite), `mobile-functional` (Pixel 5 — functional + tools specs), `accessibility` (Desktop Chrome, 30s timeout — `accessibility.spec.ts`, axe-core per-page), `a11y-static` (Desktop Chrome, 30s timeout — `deep.accessibility.spec.ts` + `keyboard.accessibility.spec.ts` + `tabs.accessibility.spec.ts`, split out of the `functional` project so `fullyParallel` accessibility runs aren't quadrupled across projects). WebServer: `pnpm astro preview` on port 4321. Permissions: clipboard-read/write.

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
| `preview-rss.mjs`               | RSS feed HTML preview                                   |
| `rehype-link-disambiguator.mjs` | Rehype plugin: auto aria-labels for ambiguous links     |
| `remark-mermaid-bypass.mjs`     | Remark plugin: mermaid-render → `<pre class="mermaid">` |
| `run-lighthouse-audit.mjs`      | Lighthouse audits against localhost/production          |
| `test-mermaid.mjs`              | Verify mermaid-isomorphic SSR works                     |
| `deploy-swap.mjs`               | Blue/green build dir selection + atomic `dist` symlink swap |
| `deploy-live.mjs`               | Post-swap publish actions: Nginx headers/reload, Cloudflare purge, IndexNow/Bing submission (production-root guarded) |

### CI (`scripts/ci/`)

~13 scripts: bundle analysis, accessibility/Lighthouse/HTML/image/link reports, JSDoc coverage, SonarQube issues, RSS validation, token-sync check, CI dashboard generation, PR comment updates, deployment cleanup. Dead report-formatting scripts (`deploy-report.mjs`, `format-accessibility-report.mjs`, `format-lighthouse-report.mjs`, `format-schema-report.mjs`, `utils/github.mjs`) were removed as unused; the `schema-validation` CI job itself still exists but no longer calls a standalone script — it just re-runs `pnpm typecheck`, since Schema.org correctness is enforced via `schema-dts` types checked there.

---

## CI/CD Pipeline

### Workflow (`.github/workflows/ci.yml`)

```text
ci-setup → build → [parallel quality checks] → [parallel tests] → reporting
```

### Quality Checks (parallel jobs)

`astro check`, Prettier, ESLint, pnpm audit, Stylelint, JSDoc coverage, Lychee (links), CSpell, SonarQube, bundle size, HTML validation, RSS validation, schema validation, image optimization. Since T14, jobs that don't consume the build artifact (`sa-astro`, `sa-prettier`, `sa-eslint`, `sa-audit`, `sa-jsdoc`, `sa-cspell`, `sa-stylelint`) no longer `needs: build` — they run immediately off a shared composite setup action (`.github/actions/setup`), instead of waiting on the production build.

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
| `BING_WEBMASTER_API_KEY`        | Secret   | Bing Webmaster URL Submission API key, used by `deploy-live.mjs` |
| `POSTBUILD_INDEXNOW`            | Optional | Enables IndexNow sitemap submission in `deploy-live.mjs` (unset = skipped) |
| `DEPLOY_LIVE_FORCE`             | Optional | Set to `1` to force `deploy-live.mjs` publish actions outside the production root |
| `DEPLOY_LIVE_PRODUCTION_ROOT`   | Optional | Overrides the production-root guard path in `deploy-live.mjs` (default `/var/www/jmrp.io`) |

> None of these variables are required for local development. `SONAR_TOKEN` and `SONAR_PROJECT_KEY` are only needed to run the Sonar phase of `pnpm verify` (SonarCloud Analysis + Issues); that phase is skipped automatically when the variables are absent. `deploy-live.mjs`'s publish actions are additionally gated behind the production-root guard (see Deployment).

---

## Config Files

### TypeScript Path Aliases (`tsconfig.json`)

```text
@components/* → src/components/*    @assets/*     → src/assets/*
@layouts/*    → src/layouts/*       @utils/*      → src/utils/*
@styles/*     → src/styles/*        @data/*       → src/data/*
@languages/*  → src/languages/*     @src/*        → src/*
@i18n         → src/i18n/index.ts   @i18n/*       → src/i18n/*
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
- **Nginx document root**: `/var/www/jmrp.io/dist/` — a **symlink** to `builds/blue` or `builds/green`, never a real directory; Nginx serves whatever it currently resolves to as `jmrp.io`
- **Build output**: `pnpm build` builds into the *inactive* color dir (`builds/blue` or `builds/green`), then atomically retargets `dist` to it (`scripts/deploy-swap.mjs` — `ln -sfn` + `mv -T`/`rename(2)`), for zero-downtime deploys
- **Live update**: Running `pnpm build` on the server immediately updates the live website — no git push, CI pipeline, or separate deploy step is needed

Steps (`pnpm build` = `scripts/deploy-swap.mjs prepare` → `astro build --outDir <color>` → `scripts/deploy-swap.mjs swap <color>` → `scripts/deploy-live.mjs`):

1. `deploy-swap.mjs prepare` picks and empties the inactive `builds/<color>` dir
2. `astro build --outDir builds/<color>` — includes the pre-build + post-build integrations (see Build System above); the site is fully built but not yet live
3. `deploy-swap.mjs swap builds/<color>` — atomically retargets the `dist` symlink; the new build is now live
4. `deploy-live.mjs` runs **after** the swap and performs the publish side effects:
   - Copies `security_headers.conf` + `security_headers_assets.conf` to the Nginx snippets path, verifies config (`nginx -t`), reloads Nginx, clears the site's Nginx cache — rolls back the config on failure
   - Purges the Cloudflare cache via API
   - Submits sitemap URLs to IndexNow and the Bing Webmaster API
5. CSP Reporter runs as separate service (`scripts/csp-reporter.mjs`)

> **Production-root guard**: This repo is checked out in multiple worktrees (production at `/var/www/jmrp.io`, plus any staging worktree) sharing the same Nginx snippets path and Cloudflare zone. `deploy-live.mjs` is a no-op — skipped entirely, before doing any work — unless `process.cwd()` matches the production root (default `/var/www/jmrp.io`, override via `DEPLOY_LIVE_PRODUCTION_ROOT`) or `DEPLOY_LIVE_FORCE=1` is set. Individual actions are further gated on their own env vars being present (Nginx deploy on `POSTBUILD_NGINX_SNIPPETS_PATH`, Cloudflare purge on `PRIVATE_CF_ZONE_ID`/`PRIVATE_CF_API_TOKEN`, IndexNow on `POSTBUILD_INDEXNOW`, Bing on `BING_WEBMASTER_API_KEY`).
>
> **First production deploy after merging this branch**: production's `/var/www/jmrp.io/dist` is still a real directory (legacy layout). `deploy-swap.mjs swap` auto-migrates it into `builds/<color>` on first run (rename the real dir out of the way, then symlink in the new build) — but that rename-then-symlink isn't atomic as *one* step, so there's a sub-millisecond window where `dist` exists as neither the old dir nor the new symlink. In practice this is negligible, but to eliminate it entirely, pre-convert `dist` to a symlink by hand before the first post-merge build (e.g. `mv dist builds/blue && ln -s builds/blue dist`).
> **No lock for concurrent builds**: nothing prevents two `pnpm build` invocations from racing on `deploy-swap.mjs`; keep deploys serial.

---

## Development Commands

```bash
pnpm dev              # Start dev server (port 4321)
pnpm build            # Production build (blue/green symlink swap, then deploy-live.mjs)
pnpm preview          # Preview production build
pnpm verify           # FULL QA pipeline — static → build → dist → Sonar → E2E (run before PR)
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

5 phases. The first and third run their steps **concurrently** via `Promise.allSettled`, accumulating every failure instead of stopping at the first one; Build and E2E are always serial:

1. **Static phase (parallel, accumulate)** — never touches `dist/`; any failure here stops the run before the build starts:
   - **Astro Check** — `pnpm typecheck --minimumFailingSeverity warning` (also validates all JSON-LD `@graph` builders against Schema.org via `schema-dts` `satisfies` types — the official Google Schema.org TypeScript vocabulary)
   - **ESLint** — `pnpm lint --max-warnings=0`
   - **Prettier** — `pnpm exec prettier --check .`
   - **Stylelint** — `pnpm lint:css`
   - **Token sync** — `node scripts/ci/check-token-sync.mjs`
   - **Spelling (CSpell)** — `pnpm exec cspell lint .`
   - **JSDoc Coverage** — `node scripts/ci/calculate-jsdoc-coverage.mjs`
2. **Build phase (serial, hard stop)** — `pnpm run build` (includes pre-build + post-build integrations, blue/green swap, `deploy-live.mjs`); a failure here skips dist-dependent checks, Sonar, and E2E entirely.
3. **Dist phase (parallel, accumulate)** — only reads `dist/`, so failures here are recorded but don't block Sonar/E2E:
   - **ATS: CV Compatibility** — `node scripts/cv/verify-ats.mjs`
   - **HTML5 Validation** — `pnpm lint:html`
   - **RSS Feed Validation** — `node scripts/ci/validate-rss.mjs dist`
   - **Broken Links (Lychee)** — `lychee --config lychee.toml --root-dir dist dist/**/*.html`
4. **Sonar phase (serial, non-blocking)**:
   - **SonarCloud Analysis** — `pnpm exec sonar-scanner` *(conditional: requires `SONAR_TOKEN`; warns but never blocks)*
   - **SonarCloud Issues** — `node scripts/ci/get-sonar-issues.mjs` *(conditional: requires `SONAR_TOKEN`; recorded as a failure at the end but doesn't block E2E)*
5. **E2E phase (serial, always last)** — **Playwright E2E** — `pnpm test:e2e`

> **Schema.org validation**: JSON-LD correctness is enforced at build via `schema-dts` types on every schema builder (`BaseHead`, `BlogPost`, `ToolLayout`, `HomePage`, `CVPage`, `PublicationsPage`, `BlogIndex`, `BlogTagPage`), checked in phase 1. This replaced a hand-rolled output checker that had no cases for TechArticle/FAQPage/HowTo/SoftwareApplication/CollectionPage and wrongly rejected valid JSON-LD `@id` node references.

The final report lists every failed step across all phases (not just the first encountered), so a single run surfaces the complete picture. Phases 3-5 require a prior build. Phase 4 is skipped without `SONAR_TOKEN`. Pre-run cleanup: removes `html-validation.json`, `rss-validation.json`.

---

## Writing Blog Posts

1. Copy `src/content/posts/en/_template.mdx`
2. Rename with numbered prefix: `013-my-post.mdx` (next free `NNN`; `slug` must match the prefix)
3. Update frontmatter: title, slug, publishedDate, tags, description ≤ 155 chars, **plus the GEO fields** — `articleType: "TechArticle"` (guides), `proficiencyLevel`, verified `topics` Q-ids, a genuine `faq`, and `howto` for step-by-step guides
4. Standard opening: a short intro paragraph (the "entradilla"), then **`<TLDRSummary>`** (before the first `##`), then import + use other components
5. Write content with MDX (avoid duplicate heading text — it creates ambiguous ToC anchors)
6. References auto-collected from markdown links + HTML `<a>` tags; the FAQ section, JSON-LD (TechArticle/FAQPage/HowTo + about/mentions), and the `AuthorCard` are **auto-rendered by `BlogPost.astro`** from the frontmatter — do not hand-add them
7. For a Spanish version, mirror to `src/content/posts/es/` with translated `faq` and the SAME `topics` Q-ids

Full workflow + field reference: the `new-blog-post` skill and `docs/BLOG_POST_GUIDE.md`.

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
- **JSON-LD**: @graph pattern on all pages, page-specific schemas (TechArticle/BlogPosting + FAQPage + HowTo + `about`/`mentions` Wikidata topics on posts; SoftwareApplication + FAQPage on tools; ProfilePage, CollectionPage, ScholarlyArticle). Validated at build via `schema-dts`.
- **Meta descriptions**: All ≤ 155 chars, validated by Playwright tests
- **noIndex**: 404 page excluded from indexing
- **llms.txt/llms-full.txt**: LLM context files (llmstxt.org standard)

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
15. **❌ Editing `public/.well-known/security.txt` without re-signing** — The file is PGP clearsigned. After any edit, re-sign with: `gpg --clearsign --default-key 0A993B268654DBBA52B7E8D3FCF653391E2C91FC public/.well-known/security.txt && mv public/.well-known/security.txt.asc public/.well-known/security.txt`

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
| `.claude/skills/*/SKILL.md`             | Claude-only skills: `i18n`, `new-blog-post`, `new-component`; `astro-build`, `accessibility-audit`, `csp-debug` are symlinks to `.github/skills/` |
| `.claude/agents/*.agent.md`             | Symlinks to `.github/agents/` (planner, implementer, reviewer) |
| `.claude/rules/*.md`                     | Path-scoped rules (4 files, `paths` frontmatter) |

> **Note**: The shared agents (`.github/agents/`) and Copilot skills (`.github/skills/`) are the single source of truth; `.claude/agents/` and the matching `.claude/skills/` entries are **symlinks** to them, so Copilot and Claude Code share the same files (no duplication). The agent frontmatter is cross-compatible (`name`, `description`, `model`); it intentionally omits `tools:` so agents **inherit all tools** (no restrictions), and the Copilot-only `handoffs:` key is ignored by Claude Code.

### Cross-Platform

| File                                     | Purpose                                          |
| ---------------------------------------- | ------------------------------------------------ |
| `CLAUDE.md`                              | Primary AI context (this file) — VS Code + Claude Code |
| `CLAUDE.local.md`                        | Personal overrides (gitignored)                  |
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
