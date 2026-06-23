---
name: new-component
description: Create a new reusable Astro UI component in src/components/ui/. Use when asked to add a component, build a UI element, or extend the component library.
argument-hint: "[component-name] [description]"
---

# New Component Skill

Create a reusable UI component for `src/components/ui/`.

## Step 1 — Create the component file

Path: `src/components/ui/ComponentName.astro`

```astro
---
/**
 * ComponentName — one-line description.
 *
 * @example
 * <ComponentName title="Example">Content</ComponentName>
 */
import { getLangFromUrl, useTranslations } from "@i18n/utils";

interface Props {
  /** Primary label or heading text. */
  title: string;
  // Add more props as needed
}

const { title } = Astro.props;
const locale = getLangFromUrl(Astro.url);
const t = useTranslations(locale);

// Generate a unique ID for accessibility linkage
const uid = `component-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
---

<div class="component-name" aria-labelledby={uid}>
  <h3 id={uid} class="component-name__title">{title}</h3>
  <div class="component-name__body">
    <slot />
  </div>
</div>

<style>
  .component-name {
    border: var(--border-1);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    margin-block: var(--space-md);
    background: var(--color-bg-subtle);
  }

  .component-name__title {
    margin-block-start: 0;
    font-size: 1rem;
    font-weight: var(--fw-semibold);
    color: var(--color-text-heading);
  }

  .component-name__body {
    margin-block-start: var(--space-sm);
  }
</style>
```

## Component rules

**Structure**

- `interface Props` at the top of frontmatter with JSDoc on each prop
- Destructure from `Astro.props`
- Scoped `<style>` block — no `is:global` unless justified
- Use CSS custom properties from `src/styles/global.css` — no hardcoded colors or sizes

**Accessibility (WCAG 2.2 AA)**

- `aria-labelledby` for sections with a visible heading
- `aria-label` when there is no visible heading — use `t()` for the label value
- `role="note"` for informational asides
- All interactive elements must be keyboard accessible with `:focus-visible` styles
- `prefers-reduced-motion` support for any animations
- Icons: `<span class="i-{collection}:{name}" aria-hidden="true"></span>`

**i18n**

- All user-facing text uses `t()` from `useTranslations()` — never hardcode English
- Import pattern: `import { getLangFromUrl, useTranslations } from "@i18n/utils";`
- Props like `title` that come from the caller (post content) are not translated internally

**IDs**

- Always generate unique IDs with `crypto.getRandomValues()` — never hardcode
- Pattern: `` `prefix-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}` ``

**Security**

- No inline styles (`style="..."`) — use UnoCSS classes or scoped CSS
- External links: `rel="external noopener noreferrer"` + `target="_blank"`

## Step 2 — Add to AGENTS.md

Add an entry to `src/components/ui/AGENTS.md` under the appropriate section. Include:

- A working MDX usage example
- A props table with types, defaults, and required/optional marking

This step is **required** — agents creating blog posts rely on AGENTS.md to discover components.

## Step 3 — Add to README.md

Add a row to the Quick Reference table in `src/components/ui/README.md` and a full
documentation section with all props, slots, and examples.

## Step 4 — Barrel export (if needed)

If the component is always used alongside another (like Tabs + TabPanel), create or
update a barrel export file:

```typescript
// src/components/ui/my-group.ts
export { default as ComponentA } from "./ComponentA.astro";
export { default as ComponentB } from "./ComponentB.astro";
```

## Step 5 — Verify

```bash
pnpm typecheck          # Catch TypeScript errors in the new component
pnpm lint               # ESLint
pnpm test:e2e tests/ui-components.spec.ts   # UI component tests
pnpm test:e2e tests/accessibility.spec.ts   # Axe-core check
```

## Path aliases

```typescript
@components/* → src/components/*
@layouts/*    → src/layouts/*
@assets/*     → src/assets/*
@utils/*      → src/utils/*
@styles/*     → src/styles/*
@data/*       → src/data/*
@languages/*  → src/languages/*
@i18n         → src/i18n/index.ts  (barrel import)
@i18n/*       → src/i18n/*
@src/*        → src/*
```
