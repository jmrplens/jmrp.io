---
name: accessibility-audit
description: Run accessibility audits and fix WCAG 2.2 AA violations. Use when asked about accessibility, a11y, WCAG, or axe-core issues.
argument-hint: "[suite: all|axe|deep|keyboard|tabs]"
---

# Accessibility Audit Skill

Audit and fix accessibility issues in jmrp.io for WCAG 2.2 AA compliance.

## Running Accessibility Tests

### Full Accessibility Suite
```bash
pkill -f "astro dev" 2>/dev/null
pnpm test:e2e --project=accessibility
```

### Specific Suites
```bash
# axe-core automated checks (light + dark themes)
pnpm test:e2e tests/accessibility.spec.ts

# Semantic landmarks, heading order, copy buttons
pnpm test:e2e tests/deep.accessibility.spec.ts

# Keyboard navigation (menu, skip link, mobile menu)
pnpm test:e2e tests/keyboard.accessibility.spec.ts

# Tab component keyboard nav, FileContent focus
pnpm test:e2e tests/tabs.accessibility.spec.ts
```

### ARIA Label Audit (on built HTML)
```bash
node scripts/audit-aria-labels.mjs
```

## WCAG Requirements

### Color Contrast
- Text: ≥4.5:1 ratio (AA), target ≥7:1 (AAA)
- Large text (≥18px bold or ≥24px): ≥3:1 ratio
- Use CSS custom properties — they're pre-verified for contrast

### Heading Hierarchy
- h1 is auto-generated from page title
- Use h2 → h3, never skip levels (h2 → h4 is invalid)

### Interactive Elements
- All interactive elements must be keyboard accessible
- Visible focus indicators required (`:focus-visible`)
- `prefers-reduced-motion` support for animations
- Tab order must be logical (avoid `tabindex` > 0)

### Images & Media
- All `<img>` require descriptive `alt` text
- Decorative images: `alt=""` + `aria-hidden="true"`
- `<Mermaid>` requires `ariaLabel` prop

### Component-Specific
| Component | Requirement |
|-----------|-------------|
| `Mermaid` | `ariaLabel` required |
| `Table` | Semantic `<thead>`, `<th scope>` |
| `TerminalCommand` | `aria-label` for copy button |
| `Collapsible` | `aria-expanded` state |
| `Tabs` | ARIA tabs pattern (radio group) |
| `Callout` | `role="note"` already included |

## Accessibility Reports
Reports are saved to `accessibility-report/` after running tests.
