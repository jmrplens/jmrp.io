---
applyTo: "tests/**/*.ts,playwright.config.ts"
---

# Testing Instructions

## Framework

- Playwright + axe-core for E2E and accessibility
- Tests in `tests/*.spec.ts`
- 3 projects: `functional` (Desktop Chrome), `mobile-functional` (Pixel 5), `accessibility` (Desktop Chrome)

## Running Tests

```bash
pnpm test:e2e                    # All tests
pnpm test:e2e --project=functional  # Functional only
pnpm test:e2e --ui               # Interactive mode
```

> ⚠️ **Stop `astro dev` before testing** — dev server lacks nonces/SRI.
>
> ```bash
> pkill -f "astro dev" 2>/dev/null; pnpm test:e2e
> ```

## Test Suites (12)

| Suite                            | Focus                                     |
| -------------------------------- | ----------------------------------------- |
| `accessibility.spec.ts`          | axe-core WCAG 2.2 AA (light + dark)       |
| `deep.accessibility.spec.ts`     | Semantic landmarks, heading order         |
| `keyboard.accessibility.spec.ts` | Menu, skip link, tab navigation           |
| `tabs.accessibility.spec.ts`     | Zero-JS radio group keyboard nav          |
| `functional.spec.ts`             | Theme toggle, mobile menu, page logic     |
| `integration.spec.ts`            | Cross-page navigation flows               |
| `security.spec.ts`               | CSP/SRI verification per page             |
| `seo.spec.ts`                    | Meta tags, JSON-LD, robots, RSS, llms.txt |
| `performance.spec.ts`            | LCP, lazy loading, broken links           |
| `prerender.spec.ts`              | Speculation rules + CSP compliance        |
| `icons.spec.ts`                  | UnoCSS icon consistency                   |
| `global-setup.ts`                | Sitemap page cache                        |

## Test Utilities

- `tests/utils/sitemap.ts` — Page discovery from sitemap
- `tests/utils/accessibility.ts` — axe result aggregation
- `tests/utils/filters.ts` — Expected error filtering
- `tests/utils/index.ts` — Barrel re-exports
- `tests/utils/types.ts` — Shared test type definitions

## Writing Tests

- Use `getCachedPages()` for page lists (avoids repeated sitemap reads)
- Accessibility tests run both light and dark themes
- Security tests check `dist/` build output directly
- Use `test.describe` for grouping related tests
- Add `test.skip` with reason for known issues

## Full QA Pipeline

```bash
pnpm verify  # Runs all: typecheck + lint + format + tests + icons
```
