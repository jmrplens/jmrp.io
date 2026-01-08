# Contributing to JMRP.io

Thank you for your interest in contributing to **jmrp.io**! This document outlines the standards and workflows for developing and maintaining the project.

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v22.0.0 or higher.
- **pnpm**: v10+ (managed via `corepack` or `npm i -g pnpm`).

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

The project follows the **Astro v6** structure with the **Content Layer API**.

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
2.  **Build**: `astro build` (Production build with optimizations).
3.  **Content Validation**: HTML validation, RSS feed check, Schema.org check.
4.  **Security**: Snyk audit (for dependencies).
5.  **E2E Testing**: Playwright tests (Functional & Accessibility).

**Individual Commands:**

- `pnpm typecheck`: Run TypeScript/Astro checks.
- `pnpm lint`: Run ESLint.
- `pnpm build`: Build for production.
- `pnpm test:e2e`: Run Playwright tests only.

## 🎨 Code Style

- **Formatting**: We use **Prettier**. Run `pnpm exec prettier --write .` to format.
- **Linting**: We use **ESLint** with Astro and TypeScript plugins.
- **Commits**: Follow conventional commit messages (e.g., `feat: ...`, `fix: ...`, `chore: ...`).

## 🔒 Security

- **Secrets**: Never commit `.env` files.
- **Dependencies**: Use `pnpm audit` or rely on the `pnpm verify` Snyk check.
- **Headers**: Security headers are generated in `post-build.ts`. Do not manually edit `dist/security_headers.conf`.

Thank you for helping improve the site!
