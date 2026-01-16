# Contributing to JMRP.io

Thank you for your interest in contributing to **jmrp.io**! This document outlines the standards and workflows for developing and maintaining the project.

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v22.0.0 or higher.
- **pnpm**: v10+ (managed via `corepack` or `npm i -g pnpm`).
- **[typos](https://github.com/crate-ci/typos)**: A fast batch spell checker (required for `pnpm verify`). Install via `cargo install typos-cli` or download from [releases](https://github.com/crate-ci/typos/releases).
- **[lychee](https://github.com/lycheeverse/lychee)**: A fast, async link checker (required for `pnpm verify`). Install via `cargo install lychee` or download from [releases](https://github.com/lycheeverse/lychee/releases).
- **[Playwright Browsers](https://playwright.dev/docs/browsers)**: Run `pnpm exec playwright install` after installation.

### Installation

```bash
git clone https://github.com/jmrplens/jmrp.io.git
cd jmrp.io
pnpm install
```

## 🛠️ Development Workflow

### Local Development

Start the Astro development server:

```bash
pnpm dev
```

The site will be available at `http://localhost:4321`.

### Project Structure

The project follows the **Astro v6.0.0-alpha.5** (experimental) structure with the **Content Layer API**. This alpha version is required for Content Layer support. Contributors should be aware of potential breaking changes between alpha releases. The exact version is pinned in `package.json`.

> **Alpha Release Note**: Report alpha-specific issues to [Astro's GitHub](https://github.com/withastro/astro/issues). Subscribe to [Astro release notes](https://github.com/withastro/astro/releases) to track updates. Keep the pinned version in `package.json` in sync and review changelogs for breaking changes.

```plaintext
/
├── src/
│   ├── content/          # Content Collections (Markdown/MDX & YAML)
│   ├── content.config.ts # Collection Definitions (Glob Loader)
│   ├── components/       # Astro & Preact components
│   ├── layouts/          # Page layouts
│   ├── pages/            # File-based routing
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

This master script (`scripts/run-verify.mjs`) orchestrates the entire QA pipeline in order:

1.  **Static Analysis**: `astro check` (Types), `eslint`, `prettier`.
2.  **Linting**: `stylelint` (CSS).
3.  **Build**: `pnpm run build` (Production build).
4.  **Content Validation**: HTML validation, RSS feed check, Schema.org check.
5.  **Documentation**: JSDoc comment coverage tracking.
6.  **Security**: Snyk audit (dependencies) and SonarCloud analysis (code quality).
7.  **External Audits**:
    - **Spelling**: `typos` for codebase spell checking.
    - **Links**: `lychee` for dead link verification in generated HTML.
8.  **E2E Testing**: Playwright tests (Functional & Accessibility matrices).

**Automatic PR Updates:**
Our CI/CD pipeline is designed to be helpful and non-intrusive. Instead of creating new comments for every push, the CI scripts will **update existing PR comments** when results change. This keeps the PR timeline clean and preserves history.

**Individual Commands:**

- `pnpm typecheck`: Run TypeScript/Astro checks.
- `pnpm lint`: Run ESLint.
- `pnpm lint:css`: Run Stylelint for CSS files.
- `pnpm build`: Build for production.
- `pnpm test:e2e`: Run all Playwright tests.
- `pnpm test:e2e --grep "specific-test"`: Run specific Playwright test.
- `pnpm exec playwright test --ui`: Run Playwright in interactive UI mode.
- `pnpm exec typos`: Run spell checking.
- `pnpm exec lychee dist/**/*.html`: Run link checking on built HTML.

### Troubleshooting

If `pnpm verify` fails:

1. **View logs**: Check output above the failure line for details. In CI, expand the failed job step.
2. **Type errors**: Run `pnpm typecheck` to isolate.
3. **Lint/format issues**: Run `pnpm lint` and `pnpm exec prettier --write .`.
4. **Build failures**: Run `pnpm build` standalone to see full error output.
5. **E2E test failures**: Run `pnpm test:e2e` or `pnpm exec playwright test --ui` to debug interactively.
6. **Spelling issues**: Run `pnpm exec typos` and add false positives to `.typos.toml`.
7. **Broken links**: Run `pnpm exec lychee dist/**/*.html` and update/remove dead URLs.
8. **Security vulnerabilities**: Review Snyk/SonarCloud CI reports and remediate or pin/update dependencies accordingly.

## 🎨 Code Style

- **Formatting**: We use **Prettier**. Run `pnpm exec prettier --write .` to format.
- **Linting**: We use **ESLint** with Astro and TypeScript plugins.
- **Commits**: Follow [Conventional Commits](https://www.conventionalcommits.org/) format:
  - `feat: add dark mode toggle` (new feature)
  - `fix: resolve mobile menu clipping` (bug fix)
  - `chore: update dependencies` (maintenance)

## 🔒 Security

- **Secrets**: Never commit `.env` files or API keys. Add sensitive files to `.gitignore`.
- **Pre-commit protection**: Consider using tools like `git-secrets` or Snyk to prevent accidental commits of secrets.
- **Secret remediation**: If secrets are accidentally committed, immediately rotate them and use [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/) or `git filter-repo` to remove them from history.
- **Dependencies**: Use `pnpm audit` or rely on the `pnpm verify` Snyk check.
- **Headers**: Security headers are generated in `post-build.ts`. Do not manually edit `dist/security_headers.conf`.

Thank you for helping improve the site!
