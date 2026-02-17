---
name: run-tests
description: Run the full QA pipeline or specific test suites with proper setup
argument-hint: "[suite-name or 'all']"
---

Run tests for jmrp.io. Follow these steps:

1. **Stop any running dev server** (dev server lacks nonces/SRI, causing security tests to fail):
```bash
pkill -f "astro dev" 2>/dev/null
```

2. **Build for production** (if not built recently):
```bash
pnpm build
```

3. **Run the requested tests**:

For **all tests** (full QA pipeline — 14 sequential steps, fail-fast):
```bash
pnpm verify
```
Pipeline steps: Astro Check → ESLint → Prettier → Stylelint → Production Build → HTML5 Validation → RSS Feed → Schema.org JSON-LD → Spelling (CSpell) → Broken Links (Lychee) → JSDoc Coverage → SonarCloud Analysis* → SonarCloud Issues* → Playwright E2E.
*SonarCloud steps require `SONAR_TOKEN` env var.

For **specific Playwright suites**:
```bash
# All E2E tests
pnpm test:e2e

# Functional tests only
pnpm test:e2e --project=functional

# Accessibility tests only
pnpm test:e2e --project=accessibility

# Single suite
pnpm test:e2e tests/security.spec.ts
pnpm test:e2e tests/seo.spec.ts
pnpm test:e2e tests/accessibility.spec.ts

# Interactive mode
pnpm test:e2e --ui
```

For **individual checks**:
```bash
pnpm typecheck        # astro check
pnpm lint             # ESLint
pnpm lint:css         # Stylelint
pnpm lint:html        # HTML5 validation (requires build)
pnpm verify-icons     # Icon consistency (not in verify pipeline)
pnpm exec cspell lint . # Spell check (bilingual EN/ES)
pnpm exec prettier --check .  # Format check
```

4. **Available test suites** (11 total):
   - `accessibility.spec.ts` — axe-core WCAG 2.2 AA (light + dark themes)
   - `deep.accessibility.spec.ts` — Semantic landmarks, heading order
   - `keyboard.accessibility.spec.ts` — Menu, skip link, tab navigation
   - `tabs.accessibility.spec.ts` — Zero-JS radio group keyboard nav
   - `functional.spec.ts` — Theme toggle, mobile menu, page logic
   - `integration.spec.ts` — Cross-page navigation flows
   - `security.spec.ts` — CSP/SRI per page
   - `seo.spec.ts` — Meta tags, JSON-LD, robots, RSS, llms.txt
   - `performance.spec.ts` — LCP, lazy loading, broken links
   - `prerender.spec.ts` — Speculation rules + CSP compliance
   - `icons.spec.ts` — UnoCSS icon consistency
