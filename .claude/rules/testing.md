---
paths:
  - "tests/**/*.ts"
  - "playwright.config.ts"
---

# Testing Rules

## Framework

- Playwright + axe-core for E2E and accessibility
- Tests in `tests/*.spec.ts`
- 3 projects: functional, mobile-functional, accessibility

## Running Tests

```bash
pnpm test:e2e                      # All tests
pnpm test:e2e --project=functional # Functional only
pnpm test:e2e --ui                 # Interactive mode
```

Stop `astro dev` before testing — dev server lacks nonces/SRI:
```bash
pkill -f "astro dev" 2>/dev/null; pnpm test:e2e
```

## Writing Tests

- Use `getCachedPages()` for page lists (avoids repeated sitemap reads)
- Accessibility tests run both light and dark themes
- Security tests check `dist/` build output directly
- Use `test.describe` for grouping related tests
- Add `test.skip` with reason for known issues
