---
name: astro-build
description: Build, preview, and verify the jmrp.io Astro 6 project. Use when asked to build, deploy, or run the QA pipeline.
argument-hint: "[command: build|verify|preview|dev]"
disable-model-invocation: true
---

# Astro Build Skill

Build and verify the jmrp.io Astro 6 SSG project.

## Build Commands

### Full Production Build (Atomic Swap)

```bash
pnpm build
```

This runs: `astro build` → atomic swap (`dist_new` → `dist_old` → `dist`) → Prettier check.

> **Deployment**: The project lives at `/var/www/jmrp.io/` on the production server. Nginx serves `/var/www/jmrp.io/dist/` directly as the document root for `jmrp.io`. Running `pnpm build` on the server immediately updates the live website — no git push or separate deploy step is needed. The atomic swap ensures zero-downtime deploys.

### Development Server

```bash
pnpm dev
```

Starts on port 4321. **Warning**: Dev server lacks nonces/SRI — do not run tests against it.

### Preview Production Build

```bash
pnpm preview
```

Serves `dist/` on port 4321. Use this for testing.

## Full QA Pipeline (`pnpm verify`)

```bash
pkill -f "astro dev" 2>/dev/null  # Stop dev server first!
pnpm verify
```

Runs `scripts/run-verify.mjs` — 13 sequential steps (fail-fast except SonarCloud):

| #  | Step                          | Command                                            |
| -- | ----------------------------- | -------------------------------------------------- |
| 1  | Static: Astro Check           | `pnpm typecheck --minimumFailingSeverity warning`  |
| 2  | Static: ESLint                | `pnpm lint --max-warnings=0`                       |
| 3  | Static: Prettier              | `pnpm exec prettier --check .`                     |
| 4  | Lint: CSS Stylelint           | `pnpm lint:css`                                    |
| 5  | Build: Production Build       | `pnpm run build`                                   |
| 6  | Lint: HTML5 Validation        | `pnpm lint:html`                                   |
| 7  | Lint: RSS Feed                | `node scripts/ci/validate-rss.mjs dist`            |
| 8  | Lint: Spelling (CSpell)        | `pnpm exec cspell lint .`                          |
| 9  | Lint: Broken Links (Lychee)   | `lychee --config lychee.toml --root-dir dist dist/**/*.html` |
| 10 | Lint: JSDoc Coverage          | `node scripts/ci/calculate-jsdoc-coverage.mjs`     |
| 11 | Security: SonarCloud Analysis | `pnpm exec sonar-scanner` *(if SONAR_TOKEN set)*   |
| 12 | Analyze: SonarCloud Issues    | `node scripts/ci/get-sonar-issues.mjs` *(if SONAR_TOKEN + SONAR_PROJECT_KEY)* |
| 13 | Tests: Playwright E2E         | `pnpm test:e2e`                                    |

Schema.org JSON-LD is validated at build via `schema-dts` `satisfies` types on every JSON-LD builder, checked by step 1 (Astro Check).

Steps 5-13 require a successful build. Steps 11-12 are conditional (skipped without env vars). SonarCloud failures are recorded but don't block subsequent steps.

## Individual Checks

```bash
pnpm typecheck        # astro check
pnpm lint             # ESLint
pnpm lint:css         # Stylelint
pnpm test:e2e         # Playwright tests
pnpm verify-icons     # Icon consistency (not in verify pipeline)
pnpm exec cspell lint . # Spell check (bilingual EN/ES)
pnpm exec prettier --check .  # Format check
pnpm lint:html        # HTML5 validation (requires build)
```

## SonarCloud Analysis

### Check Issues & Hotspots Manually

```bash
# Requires SONAR_TOKEN and SONAR_PROJECT_KEY env vars
SONAR_PROJECT_KEY=jmrplens_jmrp.io node scripts/ci/get-sonar-issues.mjs
```

This script queries the SonarCloud API for:

- **Open issues** — bugs, code smells, vulnerabilities
- **Security hotspots** — items marked TO_REVIEW
- Checks local files for `NOSONAR` suppression comments

### Run SonarCloud Scanner

```bash
pnpm exec sonar-scanner  # Requires SONAR_TOKEN
```

### SonarCloud Dashboard

- **URL**: `https://sonarcloud.io/dashboard?id=jmrplens_jmrp.io`
- **Project key**: `jmrplens_jmrp.io`
- **Organization**: `jmrplens`
- **Config**: `sonar-project.properties`

### SonarLint IDE Integration

VS Code has SonarLint connected mode configured in `.vscode/settings.json`:

- Connection ID: `jmrplens`
- Project key: `jmrplens_jmrp.io`
- Provides real-time issue detection in the editor

### Issue Suppressions

`sonar-project.properties` defines multicriteria suppressions for CI scripts that intentionally use `execSync`/`execFileSync` and regex patterns. These suppress S4721 (OS Command Injection), S5852 (Regex complexity), and S4036 (OS command shell PATH) in specific files.

## Post-Build Pipeline (Automatic)

The build integration runs these sequentially:

1. `extractCssDataUris()` — CSS data URI extraction
2. `processHtmlFiles()` — SRI, nonces, HTML minify
3. `finalizeCspConfig()` — Security headers for Nginx
4. `optimizeImages()` — Image optimization
5. `compressAssets()` — Gzip + Brotli compression
6. `fixPermissions()` + `deploySecurityHeaders()` — Nginx deployment (if configured)
7. `purgeCloudflareCache()` — Cache purge (if configured)

## Common Issues

- **Build fails with nonce errors**: The `NGINX_CSP_NONCE` placeholder is expected — it's replaced by Nginx at runtime.
- **Tests fail with CSP errors**: Stop `astro dev` first (`pkill -f "astro dev"`).
- **Port 4321 in use**: Kill existing processes: `lsof -ti:4321 | xargs kill`.
