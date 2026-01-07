# jmrp.io (Astro v5)

## Project Overview

**jmrp.io** is a high-performance personal website and portfolio built with **Astro 5**. It leverages a static site generation (SSG) architecture with **Preact** islands for interactivity. Key engineering pillars include:

*   **Performance:** 100/100 Lighthouse scores, minimal JS, optimized assets.
*   **Security:** Strict Content Security Policy (CSP), Subresource Integrity (SRI), and security headers.
*   **Accessibility:** WCAG 2.1 AA compliance verified via Axe-core and Lighthouse CI.
*   **Automation:** Automated LaTeX CV compilation, RSS feed generation, and rigorous CI/CD pipelines.

## Tech Stack

*   **Framework:** Astro 5 (SSG)
*   **UI Components:** Preact
*   **Styling:** Native CSS (Variables, Nesting) & Astro Scoped Styles
*   **Content:** MDX (Blog), YAML (Data/Config)
*   **Testing:** Playwright (E2E & A11y), Lighthouse CI, HTML Validate
*   **Build Tools:** Vite, pnpm

## Building and Running

### Prerequisites
*   Node.js (v18+)
*   pnpm (v10+)

### Key Commands

| Command | Description |
| :--- | :--- |
| `pnpm install` | Install project dependencies. |
| `pnpm dev` | Start the local development server (Astro). |
| `pnpm build` | Create a production build in `dist/`. Includes post-build processing (SRI/CSP generation). |
| `pnpm preview` | Preview the production build locally. |
| `pnpm lint` | Run ESLint across the codebase. |
| `pnpm lint:html` | Validate the generated HTML in `dist/` (run after build). |
| `pnpm test:e2e` | Execute Playwright end-to-end and accessibility tests. |
| `pnpm verify` | Full quality check: typecheck, lint, build, validate HTML, and run E2E tests. |

### CV Compilation (LaTeX)

To generate the PDF CVs manually:
```bash
cd cv_latex
latexmk -lualatex -interaction=nonstopmode CV_RequenaPlensJoseManuel_ENG.tex CV_RequenaPlensJoseManuel_SPA.tex
```
*Requires TeX Live and LuaLaTeX.*

## Development Conventions

### Code Style
*   **Formatting:** Prettier is used for code formatting. Run `pnpm exec prettier --check .` to verify.
*   **Linting:** ESLint is configured with Astro, TypeScript, and Accessibility plugins.
*   **HTML:** Generated HTML is strictly validated using `html-validate`.

### Testing Strategy
*   **Accessibility:** Every page is tested against WCAG 2.1 AA rules using Axe-core (via Playwright) and Lighthouse.
*   **Visual/Functional:** Playwright handles E2E testing.
*   **Static Analysis:** Use `pnpm verify` to ensure all checks pass before committing.

### Project Structure
*   `components`: Reusable Astro and Preact components.
*   `content`: Content collections (Blog posts) and configuration.
*   `pages`: File-based routing for the site.
*   `scripts`: Pre-build helpers and CI utilities (build processing is handled by the Astro post-build integration).
*   `cv_latex`: LaTeX source files for the resume.
*   `public`: Static assets (images, robots.txt, etc.).
