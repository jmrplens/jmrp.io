# AGENTS.md — jmrp.io

Personal technical blog and portfolio built with **Astro 6** (SSG). Bilingual EN/ES,
minimal client-side JS — progressive enhancement via `<script is:inline>` for tools
and Preact islands for real-time homelab data only. WCAG 2.2 AA,
100/100 PageSpeed, nonce-only CSP.

> For full project context see [`CLAUDE.md`](./CLAUDE.md).

---

## Core Principles

1. **WCAG 2.2 AA** (AAA when possible) — all components must pass axe-core
2. **Minimal client-side JS** — progressive enhancement via `<script is:inline>` for tools, Preact islands for homelab only
3. **No inline styles** — UnoCSS utility classes or scoped `<style>` blocks only
4. **No inline `<script>`** — use `<script is:inline>` with `nonce="NGINX_CSP_NONCE"`
5. **Dark-first theme** — dark mode is default, light is the override
6. **Bilingual** — all UI text uses `t()` from `useTranslations()`, never hardcoded EN
7. **Privacy-first tools** — all computation runs client-side, no server calls

---

## Quick Reference

| Need                           | File                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| Full project context           | [`CLAUDE.md`](./CLAUDE.md)                                                                     |
| UI component usage             | [`src/components/ui/AGENTS.md`](./src/components/ui/AGENTS.md)                                 |
| Interactive tools              | [`src/components/apps/AGENTS.md`](./src/components/apps/AGENTS.md)                             |
| Build, verify & QA pipeline    | [`.claude/skills/astro-build/SKILL.md`](./.claude/skills/astro-build/SKILL.md)                 |
| Accessibility audit (WCAG 2.2) | [`.claude/skills/accessibility-audit/SKILL.md`](./.claude/skills/accessibility-audit/SKILL.md) |
| CSP / SRI debugging            | [`.claude/skills/csp-debug/SKILL.md`](./.claude/skills/csp-debug/SKILL.md)                     |
| i18n / translations (EN/ES)    | [`.claude/skills/i18n/SKILL.md`](./.claude/skills/i18n/SKILL.md)                               |
| Write a blog post              | [`.claude/skills/new-blog-post/SKILL.md`](./.claude/skills/new-blog-post/SKILL.md)             |
| Create a UI component          | [`.claude/skills/new-component/SKILL.md`](./.claude/skills/new-component/SKILL.md)             |
| Coding conventions             | [`.github/copilot-instructions.md`](./.github/copilot-instructions.md)                         |
| Blog writing guide             | [`docs/BLOG_POST_GUIDE.md`](./docs/BLOG_POST_GUIDE.md)                                         |
| Accessibility guide            | [`docs/ACCESSIBILITY_GUIDE.md`](./docs/ACCESSIBILITY_GUIDE.md)                                 |
| i18n guide                     | [`docs/I18N_GUIDE.md`](./docs/I18N_GUIDE.md)                                                   |

---

## Anti-Patterns

Never do any of the following:

| ❌ Anti-pattern                          | Why                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| Inline `<script>` tags                   | Breaks CSP nonce-only policy                                                 |
| `style="..."` attributes                 | Use UnoCSS classes instead                                                   |
| `getElementById` / hardcoded IDs         | Use `data-*` attributes; generate IDs with `crypto.getRandomValues()`        |
| Fixed pixel widths                       | Use `%`, `rem`, `ch`                                                         |
| Missing `alt` text on images             | Accessibility requirement                                                    |
| Color as the only indicator              | Add icons or text alongside color                                            |
| Hardcoded English strings in components  | Use `t()` from `useTranslations()`                                           |
| Preact in tool components                | Tools use `<script is:inline>` only; Preact is for `src/components/homelab/` |
| `<script>` tags in MDX                   | Breaks CSP                                                                   |
| `description` > 155 chars in frontmatter | Enforced by `content-integrity.spec.ts`                                      |
| Skipping heading levels (h2 → h4)        | Breaks accessibility and document outline                                    |
| Missing `ariaLabel` on `<Mermaid>`       | Required for screen readers                                                  |

---

## Key Commands

```bash
pnpm dev              # Dev server (port 4321) — no nonces/SRI
pnpm build            # Production build (atomic swap)
pnpm preview          # Serve dist/ for testing
pnpm verify           # Full 14-step QA pipeline (run before PR)
pnpm test:e2e         # Playwright tests only
pnpm typecheck        # TypeScript / Astro check
pnpm lint             # ESLint
pnpm verify-icons     # Icon consistency (separate from pnpm verify)
```

> ⚠️ Stop `astro dev` before running `pnpm verify` or tests:
> `pkill -f "astro dev" 2>/dev/null && pnpm verify`
