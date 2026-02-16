---
name: new-component
description: Scaffold a new Astro UI component with Props interface, accessibility, and scoped styles
argument-hint: "[component-name]"
agent: implementer
---

Create a new reusable UI component for jmrp.io at `src/components/ui/${input:name}.astro`:

```astro
---
/**
 * ${input:name} — Brief description of the component.
 *
 * @example
 * <${input:name} title="Example">Content</${input:name}>
 */
interface Props {
  /** Primary prop description */
  title: string;
  // Add more props as needed
}

const { title } = Astro.props;

// Generate unique ID for accessibility
const uniqueId = `${input:name.toLowerCase()}-${Array.from(crypto.getRandomValues(new Uint8Array(4))).map(b => b.toString(16).padStart(2, '0')).join('')}`;
---

<div class="${input:name.toLowerCase()}" aria-labelledby={uniqueId}>
  <h3 id={uniqueId}>{title}</h3>
  <div class="${input:name.toLowerCase()}__content">
    <slot />
  </div>
</div>

<style>
  .${input:name.toLowerCase()} {
    border: var(--border-1);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    margin-block: var(--space-md);
    background: var(--color-bg-subtle);
  }

  .${input:name.toLowerCase()}__content {
    margin-block-start: var(--space-sm);
  }
</style>
```

**Rules**:
- Props interface at top of frontmatter with JSDoc comments
- Scoped `<style>` block — no `is:global` unless justified
- Use CSS custom properties from `src/styles/global.css`
- WCAG 2.2 AA: `aria-labelledby` for sections, keyboard accessible
- No inline styles — use UnoCSS classes or scoped CSS
- Icons: `<span class="i-{collection}:{name}" aria-hidden="true"></span>`
- Generate unique IDs with `crypto.getRandomValues()`
- Add component entry to `src/components/ui/AGENTS.md` after creation
