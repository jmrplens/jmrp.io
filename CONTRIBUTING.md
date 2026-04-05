# Contributing to JMRP.io

Thank you for your interest in contributing to **jmrp.io**! This document outlines the standards and workflows for developing and maintaining the project.

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v22.0.0 or higher.
- **pnpm**: v10+ (managed via `corepack` or `npm i -g pnpm`).
- **[lychee](https://github.com/lycheeverse/lychee)**: A fast, async link checker (required for `pnpm verify`). Install via `cargo install lychee` or download from [releases](https://github.com/lycheeverse/lychee/releases).
- **[Playwright Browsers](https://playwright.dev/docs/browsers)**: Run `pnpm exec playwright install` after installation.

### Installation

```bash
git clone https://github.com/jmrplens/jmrp.io.git
cd jmrp.io
pnpm install
```

## 🛠️ Development Workflow

### Project Structure

The project follows the **Astro 6** structure with the **Content Layer API**. This version is required for Content Layer support. The exact version is pinned in `package.json`.

> **Release Note**: We use Astro 6 (stable) to leverage the latest performance and content management features.

```plaintext
/
├── src/
│   ├── content/          # Content Collections (Markdown/MDX & YAML)
│   ├── content.config.ts # Collection Definitions (Loader API)
│   ├── components/       # Astro & Preact components
│   ├── layouts/          # Page layouts
│   ├── pages/            # File-based routing
│   ├── utils/            # Shared utilities (Icons, HTML, etc)
│   └── integrations/     # Custom Astro integrations (Pre/Post build)
├── public/               # Static assets
└── scripts/              # CI/CD and verification scripts
```

### Content Collections

All data and content live in `src/content/`. We use the **Content Layer API** with the `glob` loader defined in `src/content.config.ts`.

- **`posts`**: Blog posts in MDX (`.mdx`).
- **`site_config`**: Global site settings (`site.yaml`, `socials.yaml`).
- **`cv`**: Resume data (`main.yaml`).
- **`publications_data`**: Academic papers and coauthors (`papers.bib`, `coauthors.yaml`).

## ✅ Verification & Testing

Before submitting a Pull Request, you **must** ensure the project passes all quality checks.

**The "Golden Rule" Command:**

```bash
pnpm verify
```

This master script (`scripts/run-verify.mjs`) orchestrates 14 sequential steps (fail-fast, except SonarCloud):

| # | Step | Command |
|---|------|---------|
| 1 | Astro Check (types) | `pnpm typecheck --minimumFailingSeverity warning` |
| 2 | ESLint | `pnpm lint --max-warnings=0` |
| 3 | Prettier | `pnpm exec prettier --check .` |
| 4 | Stylelint (CSS) | `pnpm lint:css` |
| 5 | Production Build | `pnpm run build` |
| 6 | HTML5 Validation | `pnpm lint:html` |
| 7 | RSS Feed Validation | `node scripts/ci/validate-rss.mjs dist` |
| 8 | Schema.org JSON-LD | `node scripts/ci/validate-schema.mjs dist` |
| 9 | Spelling (CSpell) | `pnpm exec cspell lint .` |
| 10 | Broken Links (Lychee) | `lychee --config lychee.toml --root-dir dist dist/**/*.html` |
| 11 | JSDoc Coverage | `node scripts/ci/calculate-jsdoc-coverage.mjs` |
| 12 | SonarCloud Analysis | `pnpm exec sonar-scanner` *(requires `SONAR_TOKEN`)* |
| 13 | SonarCloud Issues | `node scripts/ci/get-sonar-issues.mjs` *(requires `SONAR_TOKEN` + `SONAR_PROJECT_KEY`)* |
| 14 | Playwright E2E | `pnpm test:e2e` |

> **Note**: `pnpm verify-icons` is a separate icon consistency check — it is **not** part of the `pnpm verify` pipeline. Run it independently when adding or changing icons.

**Automatic PR Updates:**
Our CI/CD pipeline is designed to be helpful and non-intrusive. Instead of creating new comments for every push, the CI scripts will **update existing PR comments** when results change. This keeps the PR timeline clean and preserves history.

**Individual Commands:**

- `pnpm typecheck`: Run TypeScript/Astro checks.
- `pnpm lint`: Run ESLint.
- `pnpm lint:css`: Run Stylelint for CSS files.
- `pnpm build`: Build for production.
- `pnpm verify-icons`: Run icon consistency check.
- `pnpm test:e2e`: Run all Playwright tests.
- `pnpm test:e2e --grep "specific-test"`: Run specific Playwright test.
- `pnpm exec playwright test --ui`: Run Playwright in interactive UI mode.
- `pnpm exec cspell lint .`: Run spell checking.
- `pnpm exec lychee dist/**/*.html`: Run link checking on built HTML.

### Troubleshooting

If `pnpm verify` fails:

1. **View logs**: Check output above the failure line for details. In CI, expand the failed job step.
2. **Type errors**: Run `pnpm typecheck` to isolate.
3. **Lint/format issues**: Run `pnpm lint` and `pnpm exec prettier --write .`.
4. **Build failures**: Run `pnpm build` standalone to see full error output.
5. **E2E test failures**: Run `pnpm test:e2e` or `pnpm exec playwright test --ui` to debug interactively.
6. **Spelling issues**: Run `pnpm exec cspell lint .` and add false positives to `cspell-project-words.txt`.
7. **Broken links**: Run `pnpm exec lychee dist/**/*.html` and update/remove dead URLs.
8. **Security vulnerabilities**: Run `pnpm audit` locally to check for vulnerable packages, and review SonarCloud CI reports. Remediate issues by updating, pinning, or patching dependencies as needed.

## 🎨 Code Style

- **Formatting**: We use **Prettier**. Run `pnpm exec prettier --write .` to format.
- **Linting**: We use **ESLint** with Astro and TypeScript plugins.
- **Commits**: Follow [Conventional Commits](https://www.conventionalcommits.org/) format:
  - `feat: add dark mode toggle` (new feature)
  - `fix: resolve mobile menu clipping` (bug fix)
  - `chore: update dependencies` (maintenance)

## 🌐 Translations

The site is bilingual (EN/ES). All user-facing text in components uses translation keys instead of hardcoded strings.

### How to Use Translations

```astro
---
import { getLangFromUrl, useTranslations } from "@i18n/utils";
const locale = getLangFromUrl(Astro.url);
const t = useTranslations(locale);
---

<h2>{t("nav.blog")}</h2>
<p>{t("ui.backTo", { page: "Blog" })}</p>
```

### Adding a New Translation Key

1. Add the key to `src/i18n/translations/en/common.ts` (or `tools.ts` for tool-specific strings)
2. Add the Spanish translation to `src/i18n/translations/es/common.ts` (or `tools.ts`)
3. Use `t("section.key")` in the component
4. For interpolation: `t("key", { param: value })` with `{param}` in the translation string

### Translation Rules

- **Never hardcode English strings** in components — always use `t()` function
- **Client-side scripts**: inject translations via `data-*` attributes (see `docs/I18N_GUIDE.md`)
- **Code snippets** in blog posts stay in English (not translated)
- See `docs/I18N_GUIDE.md` for the complete internationalization guide

## 🔒 Security

- **Secrets**: Never commit `.env` files or API keys. Add sensitive files to `.gitignore`.
- **Pre-commit protection**: Consider using tools like `git-secrets` to prevent accidental commits of secrets.
- **Secret remediation**: If secrets are accidentally committed, immediately rotate them and use [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/) or `git filter-repo` to remove them from history.
- **Dependencies**: Use `pnpm audit` or rely on the `pnpm verify` checks.
- **Headers**: Security headers are generated in `post-build.ts`. Do not manually edit `dist/security_headers.conf`.

Thank you for helping improve the site!
