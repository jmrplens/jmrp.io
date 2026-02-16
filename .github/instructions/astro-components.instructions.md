---
applyTo: "src/components/**/*.astro,src/layouts/**/*.astro"
---

# Astro Component Instructions

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

## Accessibility

- WCAG 2.2 AA minimum
- `aria-labelledby` for sections with visible headings
- `aria-label` when no visible heading
- `role="note"` for informational asides
- Focus-visible styles required on interactive elements
- `prefers-reduced-motion` support for animations

## Path Aliases

```typescript
@components/* → src/components/*
@layouts/*    → src/layouts/*
@utils/*      → src/utils/*
@assets/*     → src/assets/*
@styles/*     → src/styles/*
```
