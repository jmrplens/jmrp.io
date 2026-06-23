---
name: prepare-pr
description: Prepare a pull request by running full verification and generating a commit message
argument-hint: "[feature description]"
agent: reviewer
---

Prepare a pull request for jmrp.io. Follow these steps:

1. **Run the full QA pipeline**:

```bash
pkill -f "astro dev" 2>/dev/null
pnpm verify
```

This runs: typecheck → lint → format check → E2E tests → icon verification.

1. **Check for issues**:
   - Fix any TypeScript errors from `astro check`
   - Fix any ESLint/Stylelint warnings
   - Ensure Prettier formatting passes
   - All Playwright tests should pass
   - Icon consistency should be verified

2. **Review the changes**:

```bash
git diff --stat
git diff --name-only
```

1. **Create conventional commit**:
   Use the format: `type(scope): description`

   Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`, `perf`

   Scope (optional): `tools`, `blog`, `ui`, `seo`, `a11y`, `security`, `infra`

   Examples:
   - `feat(tools): add hash calculator tool`
   - `fix(a11y): improve keyboard navigation in tabs`
   - `docs(blog): add post about Nginx client certificates`
   - `refactor(ui): simplify Callout component props`
   - `test: add security header validation tests`

2. **Stage and commit**:

```bash
git add -A
git commit -m "type(scope): description"
```

1. **Push and create PR**:

```bash
git push origin HEAD
```
