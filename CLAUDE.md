# CLAUDE.md - AI Context for jmrp.io

> **Purpose**: Comprehensive context for Claude, Gemini, and other AI agents working on this codebase.
> This file enables AI to understand architecture, conventions, and constraints for code generation, reviews, and content creation.

## Project Overview

**jmrp.io** is a personal technical blog and portfolio built with **Astro 6** (beta), focusing on:

- **Zero client-side JavaScript** except for progressive enhancement islands
- **WCAG 2.2 AA/AAA accessibility** compliance
- **100/100 PageSpeed scores** on all metrics
- **Content Security Policy (CSP)** with SRI hashes
- **Optimal CLS (Cumulative Layout Shift)**

### Core Principles (User Requirements)

1. **WCAG 2.2 AA compliance** (AAA when possible) - All components must pass axe-core
2. **Zero-JS client-side** - No JavaScript unless absolutely necessary (islands pattern)
3. **Updated packages** - Use latest versions including beta/alpha
4. **Optimal CLS** - No layout shifts, proper sizing for all elements
5. **No duplicate resources** - UnoCSS deduplicates icons globally

---

## Tech Stack

> **Last verified**: February 2026 — Run `pnpm outdated` to check for updates.

| Layer           | Technology              | Version        |
| --------------- | ----------------------- | -------------- |
| Framework       | Astro                   | 6.0.0-beta.5   |
| Content         | MDX                     | 5.0.0-beta.2   |
| Styling         | UnoCSS (presetWind4)    | ^66.6.0        |
| Islands         | Preact                  | ^10.28.3       |
| Diagrams        | Mermaid (SSR)           | ^11.12.2       |
| Math            | MathJax (SSR)           | ^4.0.0-beta.11 |
| Syntax          | Shiki                   | ^3.22.0        |
| Testing         | Playwright + Axe-core   | ^1.58.1        |
| Icons           | Iconify (multiple sets) | ^3.1.1         |
| Package Manager | pnpm                    | >=10           |
| Node            | Required                | >=22.12.0      |

---

## Project Structure

```plaintext
/
├── src/
│   ├── content/           # Content Collections (MDX, YAML)
│   │   ├── posts/         # Blog posts (MDX)
│   │   ├── cv/            # Resume data (YAML)
│   │   ├── publications_data/  # Academic papers
│   │   └── site_config/   # Site settings (YAML)
│   ├── content.config.ts  # Collection schemas (Zod)
│   ├── components/
│   │   ├── apps/          # Interactive applications (CSPBuilder, HashCalculator)
│   │   ├── ui/            # 37+ reusable UI components
│   │   ├── common/        # Shared components
│   │   └── sections/      # Page sections
│   ├── pages/             # File-based routing
│   ├── layouts/           # Page layouts
│   ├── integrations/
│   │   ├── pre-build/     # Avatar fetch, beacon setup
│   │   └── post-build/    # CSP, compression, HTML minify
│   └── utils/             # Shared utilities
├── scripts/
│   ├── ci/                # CI automation scripts
│   └── *.mjs              # Development tools
├── tests/                 # Playwright E2E tests
├── docs/                  # Extended documentation
├── public/                # Static assets
└── dist/                  # Build output
```

---

## Content System

### Blog Posts Schema

Posts are MDX files in `src/content/posts/` with frontmatter:

```yaml
---
title: "Post Title" # Required
slug: "post-url-slug" # Required
publishedDate: 2025-01-15 # Required (YYYY-MM-DD)
updatedDate: 2025-01-16 # Optional
description: "SEO description" # Recommended
author: "Author Name" # Optional
authorEmail: "email@example.com" # Optional
draft: false # Default: false
tags: ["nginx", "security"] # Default: []
coverImage: ./cover.jpg # Optional (relative image)
references: # Optional
  - text: "Reference"
    url: "https://..."
---
```

### File Naming Convention

Posts use numbered prefixes for ordering: `001-post-slug.mdx`, `002-another-post.mdx`

Files starting with `_` (like `_template.mdx`) are excluded from the collection.

---

## UI Components Reference

All components are in `src/components/ui/`. Import pattern:

```mdx
import ComponentName from "@/components/ui/ComponentName.astro";
import { Tabs, TabPanel } from "@/components/ui/tabs";
```

### Primary Components

| Component         | Use Case               | Key Props                                                   |
| ----------------- | ---------------------- | ----------------------------------------------------------- |
| `Callout`         | Notes, warnings, tips  | `type: "note"\|"tip"\|"important"\|"warning"\|"caution"`    |
| `Tabs/TabPanel`   | Tabbed content         | `index: number` for TabPanel                                |
| `Code`            | Syntax highlighting    | `lang, title, showLineNumbers, highlight`                   |
| `FileContent`     | File with path header  | `filename, language, collapsible`                           |
| `Mermaid`         | Diagrams (SSR)         | `caption, maxWidth, maxHeight, ariaLabel`                   |
| `StateNotice`     | Feature status banners | `type: "deprecated"\|"experimental"\|"preview"\|"security"` |
| `StepByStep`      | Numbered instructions  | `title`                                                     |
| `CheckList`       | Semantic checklists    | Item attr: `data-check="check\|cross\|warning\|optional"`   |
| `Collapsible`     | Expandable sections    | `title, open`                                               |
| `Table`           | Data tables            | `title, striped, highlight`                                 |
| `TerminalCommand` | CLI commands           | `title, prompt`                                             |
| `CompareCode`     | Before/after code      | `beforeCode, afterCode, lang`                               |
| `BrowserSupport`  | Compatibility table    | `browsers: BrowserInfo[]`                                   |
| `YouTube`         | Video embeds           | `videoId, title`                                            |
| `References`      | Citation links         | Uses frontmatter `references`                               |

### Detailed Documentation

- **Full component docs**: `src/components/ui/README.md` (933 lines)
- **Agent quick reference**: `src/components/ui/AGENTS.md` (402 lines)
- **Blog writing guide**: `docs/BLOG_POST_GUIDE.md`
- **Accessibility guide**: `docs/ACCESSIBILITY_GUIDE.md`

---

## Styling with UnoCSS

### Configuration

UnoCSS uses `presetWind4` (Tailwind 4 compatible) + `presetIcons`:

```typescript
// uno.config.ts
presets: [
  presetWind4({ preflights: { reset: false } }),
  presetIcons({ prefix: "i-" }),
];
```

### Icon Usage

Icons use the pattern `i-{collection}:{icon-name}`:

```html
<span class="i-mdi:check-circle"></span>
<span class="i-logos:github-icon"></span>
```

Available collections: `mdi`, `logos`, `simple-icons`, `devicon`, `carbon`, `tabler`, `heroicons`, `lucide`, `fa-solid`, `fa-brands`, `vscode-icons`

**Icon Deduplication**: UnoCSS extracts icons globally to prevent duplicate CSS. Use exact icon patterns in templates.

### Dark Mode

All components must support dark mode with proper contrast ratios:

- Light mode: White/cream backgrounds
- Dark mode: Dark gray backgrounds
- WCAG AA requires ≥4.5:1 contrast for normal text

---

## Build System

### Pre-Build Integrations (`src/integrations/pre-build/`)

| Integration | Purpose                             |
| ----------- | ----------------------------------- |
| `avatar.ts` | Fetches GitHub avatar with fallback |
| `beacon.ts` | Beacon analytics setup              |

### Post-Build Integrations (`src/integrations/post-build/`)

| Integration      | Purpose                                |
| ---------------- | -------------------------------------- |
| `csp.ts`         | Generates CSP headers with SRI hashes  |
| `compression.ts` | Gzip + Brotli pre-compression          |
| `html.ts`        | HTML minification, data URI extraction |
| `css.ts`         | CSS optimization                       |
| `images.ts`      | Image optimization                     |
| `cloudflare.ts`  | Cloudflare-specific optimizations      |

### Build Commands

```bash
pnpm build          # Production build
pnpm dev            # Development server
pnpm preview        # Preview production build
pnpm verify         # Full QA pipeline
```

---

## CI/CD Pipeline

### Workflow Structure (`.github/workflows/ci.yml`)

```
ci-setup → build → [parallel quality checks] → [parallel tests] → reporting
```

### Quality Checks (Parallel)

| Job              | Tool          | Purpose                     |
| ---------------- | ------------- | --------------------------- |
| `sa-astro`       | `astro check` | TypeScript/Astro validation |
| `sa-prettier`    | Prettier      | Code formatting             |
| `sa-eslint`      | ESLint        | Linting                     |
| `sa-audit`       | pnpm audit    | Security vulnerabilities    |
| `sa-stylelint`   | Stylelint     | CSS linting                 |
| `sa-jsdoc`       | Custom script | JSDoc coverage              |
| `sa-lychee`      | Lychee        | Link checking               |
| `sa-typos`       | Typos         | Spell checking              |
| `sa-sonar`       | SonarQube     | Code quality                |
| `bundle-size`    | Custom        | Bundle analysis             |
| `html-validator` | html-validate | HTML5 validation            |
| `rss-validation` | Custom        | RSS feed validation         |

### Testing Matrix

- **Functional tests**: Playwright E2E
- **Accessibility tests**: Axe-core integration
- **Lighthouse audits**: Performance scoring

---

## Development Commands

```bash
# Core development
pnpm dev              # Start dev server
pnpm build            # Production build
pnpm preview          # Preview build

# Quality assurance
pnpm verify           # FULL QA pipeline (run before PR)
pnpm typecheck        # astro check
pnpm lint             # ESLint
pnpm lint:css         # Stylelint
pnpm format           # Prettier write

# Testing
pnpm test:e2e         # Playwright tests
pnpm test:e2e --ui    # Playwright interactive mode
```

> ⚠️ **CRITICAL**: Stop `astro dev` before running `pnpm verify` or tests.
>
> Playwright's `reuseExistingServer: true` reuses any server on port 4321.
> The dev server lacks **nonces, SRI hashes, and production optimizations**,
> causing security tests to fail with errors like `nonce=null`.
>
> ```bash
> # Always check/kill dev server first:
> pkill -f "astro dev" 2>/dev/null; pnpm verify
> ```

```bash
# Utilities
pnpm verify-icons     # Check icon consistency
pnpm exec typos       # Spell check
```

---

## Accessibility Requirements

### WCAG Compliance Checklist

- [ ] All images have descriptive `alt` text
- [ ] Interactive elements are keyboard accessible
- [ ] Color contrast ≥4.5:1 for normal text (AA)
- [ ] Color contrast ≥7:1 for enhanced (AAA)
- [ ] No reliance on color alone for information
- [ ] Proper heading hierarchy (h1 → h2 → h3)
- [ ] ARIA labels for complex widgets
- [ ] Focus indicators visible
- [ ] Reduced motion support (`prefers-reduced-motion`)

### Component-Specific Guidelines

| Component         | Requirement                                  |
| ----------------- | -------------------------------------------- |
| `Mermaid`         | Must have `ariaLabel` describing the diagram |
| `Table`           | Use semantic `<thead>`, `<th scope>`         |
| `TerminalCommand` | Include `aria-label` for copy button         |
| `Collapsible`     | Proper `aria-expanded` state                 |
| `Tabs`            | ARIA tabs pattern implemented                |

---

## Security Considerations

### Content Security Policy

The build generates CSP headers automatically:

- **script-src**: Hash-based with nonce fallback
- **style-src**: Hash-based with nonce fallback
- **default-src**: `'none'`
- **img-src**: `'self'` + specific domains
- **frame-src**: `'none'`

### No Inline JavaScript

- Use data attributes for progressive enhancement
- CSS-only interactions when possible
- Preact islands for complex interactivity

---

## Writing Blog Posts

### Quick Start

1. Copy `src/content/posts/_template.mdx`
2. Rename with numbered prefix: `007-my-post.mdx`
3. Update frontmatter (title, slug, publishedDate, tags)
4. Import needed components
5. Write content with MDX

### Component Usage Examples

````mdx
import Callout from "@/components/ui/Callout.astro";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import Mermaid from "@/components/ui/Mermaid.astro";

<Callout
  type="warning"
  title="Important"
>
  Critical security information here.
</Callout>

<Tabs labels={["Bash", "PowerShell"]}>
  <TabPanel index={0}>

```bash
sudo nginx -t
```

  </TabPanel>
  <TabPanel index={1}>

```powershell
nginx -t
```

  </TabPanel>
</Tabs>

<Mermaid caption="Request Flow" ariaLabel="Diagram showing request flow">
flowchart LR
    A[Request] --> B{Valid?}
    B -->|Yes| C[Allow]:::success
    B -->|No| D[Block]:::danger
</Mermaid>
````

### Mermaid Diagram Styling

Use built-in node classes for consistent styling:

- `.success` - Green accent
- `.warning` - Yellow accent
- `.danger` - Red accent
- `.info` - Blue accent
- `.highlight` - Purple accent
- `.secondary` - Gray accent

---

## Common Tasks

### Adding a New Component

1. Create `src/components/ui/NewComponent.astro`
2. Ensure zero client-side JS (or use Preact island)
3. Support dark mode with proper contrast
4. Add ARIA attributes for accessibility
5. Update `README.md` and `AGENTS.md`
6. Add examples to `999-testing-components.mdx`

### Updating Dependencies

```bash
pnpm update --latest     # Update all (including beta)
pnpm build               # Verify build works
pnpm verify              # Full QA check
```

### Adding Icons

Icons are auto-extracted from source files. Just use the pattern:

```astro
<span class="i-mdi:new-icon"></span>
```

Add to safelist in `uno.config.ts` if dynamically generated.

---

## File References

| Purpose           | Location                          |
| ----------------- | --------------------------------- |
| Main config       | `astro.config.mjs`                |
| Content schemas   | `src/content.config.ts`           |
| UnoCSS config     | `uno.config.ts`                   |
| TypeScript config | `tsconfig.json`                   |
| ESLint config     | `eslint.config.mjs`               |
| Playwright config | `playwright.config.ts`            |
| CI workflow       | `.github/workflows/ci.yml`        |
| Post template     | `src/content/posts/_template.mdx` |
| Component docs    | `src/components/ui/README.md`     |
| Agent quick ref   | `src/components/ui/AGENTS.md`     |
| Blog guide        | `docs/BLOG_POST_GUIDE.md`         |
| A11y guide        | `docs/ACCESSIBILITY_GUIDE.md`     |

---

## Anti-Patterns (Avoid These)

1. **❌ Inline `<script>` tags** - Breaks CSP, use data attributes
2. **❌ Inline styles** - Use UnoCSS classes
3. **❌ getElementById/querySelector** - Prefer CSS-only or islands
4. **❌ Fixed pixel widths** - Use responsive units (%, rem, ch)
5. **❌ Missing alt text** - Always describe images
6. **❌ Color-only indicators** - Add icons or text
7. **❌ Duplicate icon classes** - UnoCSS handles deduplication
8. **❌ Hardcoded dark mode colors** - Use CSS custom properties
9. **❌ Large bundle dependencies** - Prefer smaller alternatives
10. **❌ Ignoring CLS** - Always size images/embeds

---

## Version History

- **2026-02**: Verified/updated for Astro 6.0.0-beta.5, added apps folder, CodeRabbit fixes
- **2025-06**: Initial CLAUDE.md created for AI context
- Based on codebase at Astro 6.0.0-beta.5, UnoCSS 66.6.0
