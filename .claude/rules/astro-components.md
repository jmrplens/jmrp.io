---
paths:
  - "src/components/**/*.astro"
  - "src/layouts/**/*.astro"
---

# Astro Component Rules

## File Types

- Use `.astro` for all UI components — no `.tsx`/`.jsx`
- Exception: Preact islands in `src/components/homelab/` only

## Component Structure

```astro
---
interface Props {
  title: string;
  description?: string;
}
const { title, description } = Astro.props;
const titleId = `section-${crypto.getRandomValues(new Uint32Array(1))[0]}`;
---

<section aria-labelledby={titleId}>
  <h2 id={titleId}>{title}</h2>
  <slot />
</section>
<style>
  /* Scoped styles only */
</style>
```

## Rules

- Props interface at top of frontmatter
- Use Astro.props destructuring
- CSS scoped with `<style>` — no `is:global` unless justified
- All interactive elements must be keyboard accessible
- Use CSS custom properties from `src/styles/global.css`
- Icons: `<span class="i-{collection}:{name}" aria-hidden="true"></span>`
- Generate unique IDs with `crypto.getRandomValues()`
- No inline styles — use UnoCSS classes
- External links: `rel="external noopener noreferrer"` + `target="_blank"`

## i18n

- All user-facing text must use `t()` from `useTranslations()`
- Pattern: `const locale = getLangFromUrl(Astro.url); const t = useTranslations(locale);`
- Import from `@src/i18n/utils`
- Client-side scripts: inject translations via `data-*` attributes
- Never hardcode English strings in templates or ARIA labels

## Accessibility

- WCAG 2.2 AA minimum
- `aria-labelledby` for sections with visible headings
- `aria-label` when no visible heading — use `t()` for the label
- `role="note"` for informational asides
- Focus-visible styles required on interactive elements
