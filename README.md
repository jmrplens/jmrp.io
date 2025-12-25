# JMRP.io (Astro v5)

<!-- Project & Status -->

![Astro](https://img.shields.io/badge/astro-5.16.6-orange?style=flat&logo=astro)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
[![Dependabot](https://badgen.net/badge/Dependabot/enabled/green?icon=dependabot)](https://github.com/jmrplens/jmrp.io/pulls)

<!-- Code Quality -->

[![CI Status](https://github.com/jmrplens/jmrp.io/actions/workflows/ci.yml/badge.svg)](https://github.com/jmrplens/jmrp.io/actions/workflows/ci.yml)
[![SonarQube Status](https://sonarcloud.io/api/project_badges/measure?project=jmrplens_jmrp.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=jmrplens_jmrp.io)

<!-- Performance & Security -->

[![Mozilla Observatory Grade](https://img.shields.io/badge/Mozilla%20Observatory-145%2F100-brightgreen?style=flat-square&logo=mozilla)](https://observatory.mozilla.org/analyze/jmrp.io)
![PageSpeed Desktop](https://img.shields.io/badge/PageSpeed%20Desktop-100-brightgreen)
![PageSpeed Mobile](https://img.shields.io/badge/PageSpeed%20Mobile-100-brightgreen)

This is the source code for my personal website, **[jmrp.io](https://jmrp.io)**, built with **Astro 5**. It features a high-performance static architecture, robust security headers (including a strict CSP), and a focus on accessibility and modern web standards.

## 📑 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Quality Assurance](#-quality-assurance)
- [Deployment](#-deployment)
- [Security & Nginx](#-security--nginx)
- [LaTeX CV Compilation](#-latex-cv-compilation)

---

## 🚀 Features

- **Performance**:
  - **100/100 Google PageSpeed** (Desktop & Mobile).
  - **Core Web Vitals**: LCP < 0.8s, CLS < 0.031, FCP < 0.3s.
  - **SSG (Static Site Generation)**: All pages pre-rendered at build time.
  - **Islands Architecture**: Minimal JavaScript with Preact islands.
  - **Image Optimization**: WebP format with responsive sizing.
  - **Font Loading**: Optimized with fallback fonts and metric overrides.
  - **CSS Inlining**: Critical CSS inlined, async loading for non-critical.
- **Accessibility**:
  - **Axe-core Testing**: Automated WCAG 2.1 AA validation via Playwright for all pages.
  - **HTML5 Compliance**: Strict HTML validation (`html-validate`).
  - **Lighthouse CI**: Accessibility auditing on every commit.
  - **Inclusive Design**: Keyboard navigation, focus indicators, and unique `aria-labels`.
  - **Motion Sensitivity**: Respects `prefers-reduced-motion` settings.
- **Content**:
  - **Blog**: Technical articles with MDX support.
  - **RSS Feed**: Automatic generation of `rss.xml` for blog posts.
  - **CV Generation**: Automated LaTeX compilation for PDF resumes.
- **Themeable**: Light/Dark mode with system preference detection.
- **Configurable**: Centralized configuration via YAML files (`site.yml`, `socials.yml`, `cv.yml`).
- **SEO Optimized**: Dynamic Schema.org (JSON-LD), Open Graph, and Twitter Cards.

## 🛠️ Tech Stack

- **Framework**: [Astro](https://astro.build/)
- **UI Components**: [Preact](https://preactjs.com/)
- **Styling**: Native CSS (Variables, Nesting) & Astro Scoped Styles
- **Icons**: [Iconify](https://icon-sets.iconify.design/)
- **Testing**: [Playwright](https://playwright.dev/) & [Lighthouse](https://developers.google.com/web/tools/lighthouse)
- **CI/CD**: GitHub Actions

## 📂 Project Structure

<details>
<summary>Click to expand folder structure</summary>

```
/
├── src/
│   ├── components/   # Reusable Astro & Preact components
│   ├── content/      # Content Collections (Blog posts)
│   ├── data/         # YAML Data files (Site config, CV, Socials)
│   ├── layouts/      # Page layouts (Base, etc.)
│   ├── pages/        # File-based routing
│   ├── styles/       # Global CSS & Fonts
│   └── utils/        # Helper functions
├── public/           # Static assets (images, fonts, robots.txt)
├── scripts/          # Build & Maintenance scripts
├── tests/            # Playwright E2E & Accessibility tests
├── cv_latex/         # LaTeX source files for CV
├── astro.config.mjs  # Astro configuration
└── package.json      # Dependencies & Scripts
```

</details>

## 🏁 Getting Started

### Prerequisites

- Node.js (v18+)
- pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/jmrplens/jmrp.io.git

# Install dependencies
pnpm install

# Start development server
pnpm run dev
```

### Build

```bash
pnpm run build
```

This command will:

1. Fetch latest avatars.
2. Build the Astro site.
3. Index content for search.
4. Process inline styles and extract assets.
5. Generate SRI and CSP hashes.

## 🧪 Quality Assurance

This project employs a rigorous testing pipeline to ensure quality and compliance.

### Accessibility Testing

We perform comprehensive accessibility checks:

- **Axe-core (via Playwright)**: Scans every page against **WCAG 2.1 AA** and **Best Practice** rules.
  - **Dual-Theme Matrix**: Tests run in parallel for both **Light** and **Dark** modes to ensure contrast compliance in all contexts.
  - **Global SVG Exclusion**: Prevents false positives in diagrams (Mermaid, etc.).
  - Generates detailed HTML reports (`accessibility-report/`) and fails the build on any violation.
- **Lighthouse CI**: Runs Lighthouse audits on all pages, enforcing high scores for Accessibility, Performance, and SEO.
  - **Dual-Theme Execution**: configured to run separate audits for **Light** and **Dark** modes (2 runs each, 4 total per page).
- **Manual Checks**: The pipeline flags "incomplete" checks (e.g., complex color contrast) for manual review.

### Content Validation

- **HTML Validation**: `html-validate` checks generated HTML for standard compliance and semantic correctness.
- **RSS Validation**: `validate-rss.mjs` ensures the generated `rss.xml` strictly follows RSS 2.0 specifications.
- **Schema.org**: `validate-schema.mjs` verifies the structure of JSON-LD data for SEO.

## 🚀 Deployment

The site is built as a static folder (`dist/`) and can be deployed to any static host. I use **Docker** with **Nginx**.

### Docker

```bash
docker build -t jmrp-io .
docker run -p 8080:80 jmrp-io
```

## 🔒 Security & Nginx

The project includes advanced Nginx configuration for security headers and asset delivery.

- [Main Nginx Configuration Example](examples/nginx/nginx.conf.example)
- [Security Headers Example](examples/nginx/security_headers.conf.example)

**Key Security Features:**: Nginx reverse proxy handles requests to external services (Mastodon, Matrix, Meshtastic), hiding upstreams and preventing CORS issues.

- **SRI (Subresource Integrity)**: Ensures that fetched resources haven't been manipulated.
- **CSP (Content Security Policy)**: Uses `nonce` and SHA-256 hashes. Strict-dynamic was replaced with precise hashes for better compatibility with Astro's hydration.
- **HSTS**: Enforces HTTPS.

## 📄 LaTeX CV Compilation

The project includes LaTeX source files to generate professional PDF CVs.

**Prerequisites:**

- TeX Live (Full distribution)
- `latexmk`
- `lualatex`

**Compilation:**

```bash
cd cv_latex
latexmk -lualatex -interaction=nonstopmode CV_RequenaPlensJoseManuel_ENG.tex CV_RequenaPlensJoseManuel_SPA.tex
```
