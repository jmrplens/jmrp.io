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

The project follows the **Astro v6 (alpha/experimental)** structure with the **Content Layer API**.

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
- `pnpm build`: Build for production.
- `pnpm test:e2e`: Run Playwright tests only.

### Troubleshooting

If `pnpm verify` fails:

1. **View logs**: Check output above the failure line for details. In CI, expand the failed job step.
2. **Type errors**: Run `pnpm typecheck` to isolate.
3. **Lint/format issues**: Run `pnpm lint` and `pnpm exec prettier --write .`.
4. **Build failures**: Run `pnpm build` standalone to see full error output.

## 🎨 Code Style

- **Formatting**: We use **Prettier**. Run `pnpm exec prettier --write .` to format.
- **Linting**: We use **ESLint** with Astro and TypeScript plugins.
- **Commits**: Follow conventional commit messages (e.g., `feat: ...`, `fix: ...`, `chore: ...`).

## 🔒 Security

- **Secrets**: Never commit `.env` files.
- **Dependencies**: Use `pnpm audit` or rely on the `pnpm verify` Snyk check.
- **Headers**: Security headers are generated in `post-build.ts`. Do not manually edit `dist/security_headers.conf`.

Thank you for helping improve the site!
