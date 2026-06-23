# Internationalization (i18n) Guide

> Complete guide for working with translations in the jmrp.io project.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [URL Structure](#url-structure)
- [Using Translations in Components](#using-translations-in-components)
- [Client-Side Translations](#client-side-translations)
- [Adding a New Translation Key](#adding-a-new-translation-key)
- [Translation File Structure](#translation-file-structure)
- [Formatting Functions](#formatting-functions)
- [Language Switcher](#language-switcher)
- [SEO & hreflang](#seo--hreflang)
- [Adding a Third Language](#adding-a-third-language)
- [Content i18n (Blog Posts)](#content-i18n-blog-posts)
- [Common Patterns](#common-patterns)
- [Anti-Patterns](#anti-patterns)

---

## Overview

The site is bilingual (English/Spanish) using Astro's built-in i18n routing with a custom translation layer. All UI chrome, navigation, aria labels, SEO metadata, and JSON-LD schemas are fully translated. Blog post and tool content (MDX) remains in English only — code snippets are never translated.

## Architecture

```text
src/i18n/
├── config.ts              # Locale type, defaultLocale, localeConfig
├── index.ts               # Barrel export (re-exports everything)
├── utils.ts               # getLangFromUrl, useTranslations, formatDate, etc.
└── translations/
    ├── index.ts            # Merges en/es common+tools → translations map
    ├── en/
    │   ├── common.ts       # ~460 keys — nav, ui, aria, blog, footer, pages, etc.
    │   └── tools.ts        # ~1350 keys — per-tool translations
    └── es/
        ├── common.ts       # Mirror of EN with Spanish translations
        └── tools.ts        # Mirror of EN tools with Spanish translations
```

### Key Files

| File                    | Purpose                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `config.ts`             | Defines `Locale` type (`"en" \| "es"`), `defaultLocale`, `localeConfig` (label, BCP47, OG locale, direction, flag) |
| `utils.ts`              | All i18n utility functions (translation, path helpers, formatting)                                                 |
| `translations/index.ts` | Merges `common` + `tools` per locale into a single `translations` map                                              |
| `en/common.ts`          | English UI strings (~460 keys)                                                                                     |
| `en/tools.ts`           | English tool-specific strings (~1350 keys)                                                                         |
| `es/common.ts`          | Spanish UI strings (mirror of EN)                                                                                  |
| `es/tools.ts`           | Spanish tool-specific strings (mirror of EN)                                                                       |

## URL Structure

| Locale            | Example URL                         | Prefix |
| ----------------- | ----------------------------------- | ------ |
| English (default) | `/blog/`, `/tools/`, `/cv`          | None   |
| Spanish           | `/es/blog/`, `/es/tools/`, `/es/cv` | `/es/` |

- **Default locale** (`en`) has no URL prefix
- **Non-default locales** are prefixed: `/es/blog/`, `/es/tools/`
- **hreflang alternates** are auto-generated for all pages
- **Language switcher** in the header toggles between locales preserving the current path

## Using Translations in Components

### Basic Pattern (Astro Components)

```astro
---
import { getLangFromUrl, useTranslations } from "@i18n/utils";

const locale = getLangFromUrl(Astro.url);
const t = useTranslations(locale);
---

<nav aria-label={t("aria.mainNav")}>
  <a href="/">{t("nav.home")}</a>
  <a href="/blog/">{t("nav.blog")}</a>
</nav>
```

### With Interpolation

Translation strings can include `{placeholder}` tokens:

```typescript
// In en/common.ts
backTo: "← Back to {page}",
```

```astro
<a href="/blog/">{t("ui.backTo", { page: t("nav.blog") })}</a>
<!-- Output: "← Back to Blog" (EN) or "← Volver a Blog" (ES) -->
```

### With Localized Paths

```astro
---
import {
  getLangFromUrl,
  useTranslations,
  useTranslatedPath,
} from "@i18n/utils";

const locale = getLangFromUrl(Astro.url);
const t = useTranslations(locale);
const translatePath = useTranslatedPath(locale);
---

<a href={translatePath("/blog/")}>{t("nav.blog")}</a>
<!-- EN: /blog/ | ES: /es/blog/ -->
```

### Using `Astro.currentLocale`

In some cases you can use `Astro.currentLocale` instead of `getLangFromUrl`:

```astro
---
import type { Locale } from "@i18n/config";
import { useTranslations } from "@i18n/utils";

const locale = (Astro.currentLocale ?? "en") as Locale;
const t = useTranslations(locale);
---
```

## Client-Side Translations

Client-side `<script>` blocks cannot import Astro modules. Inject translations via `data-*` attributes:

```astro
---
const t = useTranslations(locale);
---

<article
  data-code-fallback={t("pages.blogPost.codeFallback")}
  data-no-results={t("pages.github.noReposFound")}
>
  <!-- Content -->
</article>

<script>
  const article = document.querySelector("article");
  const fallback = article?.getAttribute("data-code-fallback") ?? "Code";
  const noResults = article?.getAttribute("data-no-results") ?? "No results";
</script>
```

> **Rule**: Never hardcode translatable strings in `<script>` blocks. Always use `data-*` attributes.

## Adding a New Translation Key

### Step 1: Add to English source

```typescript
// src/i18n/translations/en/common.ts
export const common = {
  // ...existing keys
  mySection: {
    myKey: "English text here",
    withParam: "Hello, {name}!",
  },
};
```

### Step 2: Add to Spanish mirror

```typescript
// src/i18n/translations/es/common.ts
export const common = {
  // ...existing keys (same structure!)
  mySection: {
    myKey: "Texto en español aquí",
    withParam: "¡Hola, {name}!",
  },
};
```

### Step 3: Use in component

```astro
<p>{t("mySection.myKey")}</p>
<p>{t("mySection.withParam", { name: "World" })}</p>
```

### Step 4: Verify

```bash
pnpm build   # Ensures no missing keys
pnpm test:e2e  # Validates translations render correctly
```

### For Tool-Specific Keys

Use `tools.ts` instead of `common.ts`:

```typescript
// src/i18n/translations/en/tools.ts
export const tools = {
  myTool: {
    title: "My Tool Title",
    placeholder: "Enter value...",
  },
};
```

Access with `t("myTool.title")` — tools keys are merged with common keys.

## Translation File Structure

```typescript
// src/i18n/translations/en/common.ts
export const common = {
  nav: {
    home: "Home",
    blog: "Blog",
    tools: "Tools",
    cv: "CV",
    publications: "Publications",
    repositories: "Repositories",
    homelab: "Homelab",
  },
  ui: {
    skipToContent: "Skip to content",
    readMore: "Read more",
    backTo: "← Back to {page}",
    switchLanguage: "Switch to {lang}",
    // ... more UI strings
  },
  aria: {
    mainNav: "Main Navigation",
    searchRepos: "Search repositories",
    // ... all ARIA labels
  },
  blog: {
    publishedOn: "Published on {date}",
    updatedOn: "Updated on {date}",
    // ... blog-related strings
  },
  seo: {
    titleSuffix: "JMRP",
    jobTitle: "Research Engineer",
    // ... SEO strings
  },
  pages: {
    github: { findRepoPlaceholder: "Find a repository...", ... },
    cv: { schemaDescription: "...", ... },
    publications: { abstract: "Abstract", bibtex: "BibTeX" },
    toolsCategory: { securityDesc: "...", ... },
    notFound: { nedryAlt: "..." },
    homelab: { schemaName: "..." },
    blogPost: { codeFallback: "Code", ... },
  },
  footer: { copyright: "© {year} {author}", ... },
};
```

## Formatting Functions

### `formatDate(date, locale)`

```typescript
import { formatDate } from "@i18n/utils";
formatDate(new Date("2025-01-15"), "en"); // "January 15, 2025"
formatDate(new Date("2025-01-15"), "es"); // "15 de enero de 2025"
```

### `formatNumber(num, locale)`

```typescript
import { formatNumber } from "@i18n/utils";
formatNumber(1234567, "en"); // "1,234,567"
formatNumber(1234567, "es"); // "1.234.567"
```

### `pluralize(count, forms, locale)`

```typescript
import { pluralize } from "@i18n/utils";
pluralize(1, { one: "post", other: "posts" }, "en"); // "post"
pluralize(3, { one: "post", other: "posts" }, "en"); // "posts"
```

## Language Switcher

The `LanguageSwitcher.astro` component in the header toggles between locales:

- Detects current locale from URL
- Shows the alternate locale flag/label
- Preserves the current path when switching
- Uses `useTranslatedPath()` for correct URL construction

## SEO & hreflang

### Automatic hreflang

`BaseHead.astro` generates `<link rel="alternate">` tags for all locales:

```html
<link
  rel="alternate"
  hreflang="en"
  href="https://jmrp.io/blog/"
/>
<link
  rel="alternate"
  hreflang="es"
  href="https://jmrp.io/es/blog/"
/>
<link
  rel="alternate"
  hreflang="x-default"
  href="https://jmrp.io/blog/"
/>
```

### OG Locale

```html
<meta
  property="og:locale"
  content="en_US"
/>
<meta
  property="og:locale:alternate"
  content="es_ES"
/>
```

### JSON-LD

Translated strings are used in JSON-LD schemas via `t()`:

```astro
---
const schema = {
  "@type": "ProfilePage",
  name: t("pages.cv.schemaDescription"),
  jobTitle: t("seo.jobTitle"),
};
---
```

## Adding a Third Language

To add a new locale (e.g., French):

### 1. Update config

```typescript
// src/i18n/config.ts
export type Locale = "en" | "es" | "fr";
export const locales = ["en", "es", "fr"] as const;
export const localeConfig = {
  // ...existing
  fr: {
    label: "Français",
    bcp47: "fr-FR",
    ogLocale: "fr_FR",
    dir: "ltr",
    flag: "🇫🇷",
  },
};
```

### 2. Create translation files

```bash
cp src/i18n/translations/en/common.ts src/i18n/translations/fr/common.ts
cp src/i18n/translations/en/tools.ts src/i18n/translations/fr/tools.ts
```

### 3. Update translations barrel

```typescript
// src/i18n/translations/index.ts
import { common as frCommon } from "./fr/common";
import { tools as frTools } from "./fr/tools";

export const translations = {
  en: { ...enCommon, ...enTools },
  es: { ...esCommon, ...esTools },
  fr: { ...frCommon, ...frTools },
};
```

### 4. Update Astro config

```javascript
// astro.config.mjs
i18n: {
  defaultLocale: "en",
  locales: ["en", "es", "fr"],
}
```

### 5. Translate all strings

Replace all English values in `fr/common.ts` and `fr/tools.ts` with French translations.

### 6. Build & test

```bash
pnpm build    # Should generate /fr/ routes
pnpm test:e2e # Validate all pages
```

## Content i18n (Blog Posts)

Blog posts and tool documentation (MDX files) are **not currently translated** — they exist only in English. Only the UI chrome, navigation, ARIA labels, SEO metadata, and schemas are translated.

If you want to add translated blog posts in the future:

1. Create a locale-specific content directory structure
2. Use Astro's content collection `locale` field
3. Update the blog listing and post pages to filter by locale

## Common Patterns

### Page with Translations

```astro
---
import {
  getLangFromUrl,
  useTranslations,
  useTranslatedPath,
} from "@i18n/utils";

const locale = getLangFromUrl(Astro.url);
const t = useTranslations(locale);
const translatePath = useTranslatedPath(locale);
---

<a href={translatePath("/")}>{t("nav.home")}</a>
```

### Component with Translated ARIA

```astro
---
import { getLangFromUrl, useTranslations } from "@i18n/utils";

const locale = getLangFromUrl(Astro.url);
const t = useTranslations(locale);
---

<button aria-label={t("aria.closeMenu")}>✕</button>
```

### Pluralization

```astro
---
import { pluralize } from "@i18n/utils";
const starText = pluralize(
  count,
  {
    one: t("pages.github.starSingular"),
    other: t("pages.github.starPlural"),
  },
  locale,
);
---

<span>{count} {starText}</span>
```

## Anti-Patterns

| ❌ Don't                             | ✅ Do                                                   |
| ------------------------------------ | ------------------------------------------------------- |
| `<h2>Search</h2>`                    | `<h2>{t("ui.search")}</h2>`                             |
| `aria-label="Close menu"`            | `aria-label={t("aria.closeMenu")}`                      |
| `placeholder="Type here..."`         | `placeholder={t("ui.placeholder")}`                     |
| `const label = "Code"` in `<script>` | Use `data-label={t("label")}` + read via `getAttribute` |
| Hardcoded date: `"Jan 15, 2025"`     | `formatDate(date, locale)`                              |
| `1,234` in template                  | `formatNumber(1234, locale)`                            |
