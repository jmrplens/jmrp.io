---
name: csp-debug
description: Debug Content Security Policy (CSP) and Subresource Integrity (SRI) issues in the jmrp.io project
argument-hint: "[issue: violation|nonce|sri|headers|all]"
---

# CSP Debug Skill

Debug and fix Content Security Policy and SRI issues in the jmrp.io Astro 6 project.

## CSP Architecture

This project uses a **nonce-only CSP strategy**:

- Nginx replaces the `NGINX_CSP_NONCE` placeholder with `$cspNonce` per-request
- Two header files are generated at build time:
  - `security_headers.conf` — For HTML pages (nonce in `script-src` + `style-src` + `strict-dynamic`)
  - `security_headers_assets.conf` — For static assets (`default-src 'none'`, no nonces)

## Key Files

| File | Purpose |
|---|---|
| `src/integrations/post-build/csp.ts` | Generates `security_headers.conf` and `security_headers_assets.conf` |
| `src/integrations/post-build/html.ts` | Adds SRI integrity hashes, nonce attributes, inline style → class |
| `src/integrations/vite-plugin-prefetch-nonce.ts` | Patches Astro's `appendSpeculationRules` for CSP nonce compliance |
| `src/components/ui/SRIEventListener.astro` | SRI integrity for inline event listeners |
| `scripts/csp-reporter.mjs` | CSP violation receiver with Telegram notifications |
| `tests/security.spec.ts` | E2E tests verifying CSP/SRI on all pages |

## Common CSP Violations

### 1. Inline Script Without Nonce

**Problem**: `<script>` without `nonce` attribute.
**Fix**: Use `<script is:inline>` in Astro components (post-build adds nonce automatically).
**Check**: Search for `<script` tags missing `is:inline` in `.astro` files.

### 2. Inline Style Violations

**Problem**: `style="..."` inline attributes break CSP `style-src`.
**Fix**: Use UnoCSS utility classes or scoped `<style>` blocks.
**Check**:

```bash
grep -rn 'style="' src/components/ src/layouts/ src/pages/ --include="*.astro" | grep -v '<style'
```

### 3. Missing SRI Integrity Hash

**Problem**: External `<script src>` or `<link rel="stylesheet">` without `integrity` attribute.
**Fix**: The post-build pipeline auto-generates SRI hashes. Rebuild with `pnpm build`.

### 4. Data URI Violations

**Problem**: `data:` URIs in CSS or HTML break strict CSP.
**Fix**: The post-build pipeline extracts data URIs to physical files (`src/integrations/post-build/css.ts`).

### 5. Speculation Rules Without Nonce

**Problem**: Astro's prefetch injects `<script type="speculationrules">` without nonce.
**Fix**: The Vite plugin `vite-plugin-prefetch-nonce.ts` handles this automatically.

## Debugging Commands

### Run Security Tests Only

```bash
pnpm test:e2e --grep "security"
```

### Check Generated CSP Headers

```bash
cat dist/security_headers.conf
```

### Verify SRI on Built HTML

```bash
grep -rn 'integrity=' dist/ --include="*.html" | head -20
```

### Check for Inline Styles in Source

```bash
grep -rn 'style="' src/ --include="*.astro" | grep -v '<style' | grep -v '<!--'
```

### Check Nonce Placeholders in Build Output

```bash
grep -rn 'NGINX_CSP_NONCE' dist/ --include="*.html" | head -10
```

### Start CSP Reporter (Requires env vars)

```bash
TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=xxx node scripts/csp-reporter.mjs
```

## Critical Rules

- **Never use inline `<script>` tags** — they break CSP nonce-only policy
- **Never use inline `style="..."` attributes** — use UnoCSS utility classes
- **Always rebuild after changes** — SRI hashes and nonce placeholders are generated at build time
- **Dev server lacks nonces/SRI** — always test CSP against `pnpm preview`, not `pnpm dev`
- **External links**: Use `rel="external noopener noreferrer"` + `target="_blank"`
- JSON-LD must use `safeJsonLd()` from `@utils/html` to prevent XSS

## SonarCloud Security Analysis

For security issues beyond CSP/SRI (code smells, vulnerabilities, hotspots), use SonarCloud:

### Check Security Hotspots

```bash
SONAR_PROJECT_KEY=jmrplens_jmrp.io node scripts/ci/get-sonar-issues.mjs
```

Requires `SONAR_TOKEN` env var. Reports open issues and TO_REVIEW security hotspots.

### SonarCloud Dashboard

`https://sonarcloud.io/dashboard?id=jmrplens_jmrp.io`

### SonarLint IDE

SonarLint connected mode is configured in `.vscode/settings.json` — provides real-time security issue detection in the editor.

### Key Security Rules Tracked

- **S4721** — OS Command Injection (execSync/execFileSync usage)
- **S5852** — Regex Denial of Service (complex regex patterns)
- **S4036** — OS command shell security (PATH resolution)
- Suppressions defined in `sonar-project.properties` for CI scripts with validated inputs
