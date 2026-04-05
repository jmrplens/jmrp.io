---
name: i18n
description: Add or update translations for the EN/ES bilingual system. Use when asked about translations, missing keys, locale routing, hardcoded strings, or adding a new language.
argument-hint: "[action: add-key|fix-missing|audit|new-locale]"
---

# i18n Skill

Add and maintain translations for the jmrp.io bilingual (EN/ES) system.

## Architecture

- **Default locale**: `en` (unprefixed URLs: `/blog/`)
- **Other locales**: prefixed (`/es/blog/`)
- **Source of truth**: English (`en`) — all keys must exist in EN before ES
- **Config**: `src/i18n/config.ts` — locale list, BCP 47 tags, OG locales
- **Utilities**: `src/i18n/utils.ts` — `getLangFromUrl`, `useTranslations`, `useTranslatedPath`, `formatDate`, `formatNumber`, `pluralize`

## Translation Files

```
src/i18n/translations/
├── index.ts          # Barrel — merges common + tools per locale
├── en/
│   ├── common.ts     # Navigation, layout, ARIA labels, shared UI
│   └── tools.ts      # Tool-specific strings
└── es/
    ├── common.ts     # Spanish equivalents of common.ts
    └── tools.ts      # Spanish equivalents of tools.ts
```

Key naming convention: dot-notation with section prefix.

```
nav.*       Navigation items
ui.*        Generic UI labels (buttons, states, messages)
aria.*      ARIA labels for screen readers
content.*   Content-level notices (fallback, draft, etc.)
tools.*     Tool-specific strings (in tools.ts)
```

## Standard Pattern (Astro components)

```astro
---
import { getLangFromUrl, useTranslations } from "@i18n/utils";
const locale = getLangFromUrl(Astro.url);
const t = useTranslations(locale);
---

<nav aria-label={t("aria.mainNav")}>
  <a href="/">{t("nav.home")}</a>
</nav>
<p>{t("ui.backTo", { page: "Blog" })}</p>
```

- Call `getLangFromUrl` + `useTranslations` once per component frontmatter
- `t(key)` returns the string for the current locale, falling back to EN if missing
- Interpolation: `t("key", { param: value })` — use `{param}` in the translation string

## Client-Side Scripts (`<script is:inline>`)

Scripts cannot import modules, so inject translations via `data-*` attributes:

```astro
---
const t = useTranslations(locale);
---
<div
  data-error-msg={t("ui.error")}
  data-copy-label={t("shared.copy")}
  data-copied-label={t("shared.copied")}
>
  <!-- tool UI -->
</div>

<script is:inline nonce="NGINX_CSP_NONCE">
  const container = document.querySelector("[data-error-msg]");
  const errorMsg = container.getAttribute("data-error-msg");
</script>
```

Never hardcode English strings inside `<script is:inline>` blocks.

## Adding a New Translation Key

1. Add the key to `src/i18n/translations/en/common.ts` (or `tools.ts`)
2. Add the Spanish translation to `src/i18n/translations/es/common.ts` (or `tools.ts`)
3. Both files must be updated together — the EN key is the source of truth
4. Use the key in components with `t("section.key")`

Example — adding `ui.share`:

```typescript
// src/i18n/translations/en/common.ts
ui: {
  // ... existing keys
  share: "Share",
}

// src/i18n/translations/es/common.ts
ui: {
  // ... existing keys
  share: "Compartir",
}
```

## Formatting Utilities

All from `@i18n/utils`:

```typescript
import { formatDate, formatNumber, pluralize } from "@i18n/utils";

formatDate(new Date("2025-01-15"), "en");   // "January 15, 2025"
formatDate(new Date("2025-01-15"), "es");   // "15 de enero de 2025"

formatNumber(1234567, "en");  // "1,234,567"
formatNumber(1234567, "es");  // "1.234.567"

pluralize(1, { one: "post", other: "posts" }, "en");  // "post"
pluralize(3, { one: "post", other: "posts" }, "en");  // "posts"
```

## Localized URLs

```astro
---
import { useTranslatedPath } from "@i18n/utils";
const translatePath = useTranslatedPath(locale);
---
<a href={translatePath("/blog/")}>{t("nav.blog")}</a>
<!-- EN: /blog/   ES: /es/blog/ -->
```

## Auditing for Missing or Hardcoded Strings

```bash
# Find hardcoded English strings in component templates (false positives expected — review manually)
grep -rn '"[A-Z][a-z]' src/components/ src/layouts/ src/pages/ --include="*.astro" \
  | grep -v "//\|<!--\|class=\|href=\|src=\|type=\|lang=\|charset=\|content=" \
  | grep -v "\.astro\""

# Find components missing the t() import
grep -rL "useTranslations" src/components/ui/ --include="*.astro"

# Run i18n tests
pnpm test:e2e tests/i18n.spec.ts
```

## Rules

- **Never hardcode English strings** in component templates or ARIA labels
- **Blog post content** stays in English — only UI chrome is translated
- **Code snippets** in blog posts are not translated
- **Both locales updated together** — never add a key to one without the other
- **`t()` falls back to EN** if a key is missing in ES — use this as a safety net, not a workflow

## Full Reference

See `docs/I18N_GUIDE.md` for the complete internationalization guide.
