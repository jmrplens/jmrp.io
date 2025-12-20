# jmrp.io - Personal R&D Portfolio

<!-- Project & Status -->
![Astro](https://img.shields.io/badge/astro-5.16.6-orange?style=flat&logo=astro)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
[![Dependabot](https://badgen.net/badge/Dependabot/enabled/green?icon=dependabot)](https://github.com/jmrplens/jmrp.io/pulls)

<!-- Code Quality -->
[![Build Status](https://github.com/jmrplens/jmrp.io/actions/workflows/build.yml/badge.svg)](https://github.com/jmrplens/jmrp.io/actions/workflows/build.yml)
[![Quality Checks](https://github.com/jmrplens/jmrp.io/actions/workflows/quality.yml/badge.svg)](https://github.com/jmrplens/jmrp.io/actions/workflows/quality.yml)
[![SonarQube Status](https://sonarcloud.io/api/project_badges/measure?project=jmrplens_jmrp.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=jmrplens_jmrp.io)

<!-- Performance & Security -->
[![Mozilla Observatory Grade](https://img.shields.io/mozilla-observatory/grade/jmrp.io?publish)](https://observatory.mozilla.org/analyze/jmrp.io)
![PageSpeed Desktop](https://img.shields.io/badge/PageSpeed%20Desktop-100-brightgreen)
![PageSpeed Mobile](https://img.shields.io/badge/PageSpeed%20Mobile-100-brightgreen)

> **"Steal this website"**
>
> I believe in the open web. You are free (and encouraged!) to copy, modify, and reuse this project for your own portfolio or website. The code is open source under the MIT license. Go ahead, clone it, break it, and make it yours.

High-performance, accessibility-first portfolio website for **José Manuel Requena Plens**, R&D Engineer. Built with **Astro**, **Preact**, and **TypeScript**, designed to be fast, secure, and easy to configure.

## 🚀 Features

-   **Performance First**: Core Web Vitals optimized. Zero CLS, LCP < 1.0s.
-   **Security Hardened**: 
    -   Strict Content Security Policy (CSP) with `nonce` generation.
    -   Subresource Integrity (SRI) for all scripts and styles.
    -   Security Headers (HSTS, X-Frame-Options, X-Content-Type-Options).
    -   A+ rating on Mozilla Observatory.
-   **Accessible**: 
    -   Semantic HTML structure.
    -   Proper `aria-label` and `aria-hidden` usage.
    -   High contrast ratios and focus management.
    -   Reduced motion support.
-   **Themeable**: Light/Dark mode with system preference detection.
-   **Configurable**: Centralized configuration via YAML files (`site.yml`, `socials.yml`, `cv.yml`).
-   **SEO Optimized**: Dynamic Schema.org (JSON-LD), Open Graph, and Twitter Cards.
-   **LaTeX CV**: Automated generation of PDF CVs (English & Spanish) from LaTeX sources.

## 🛠️ Tech Stack

-   **Framework**: [Astro](https://astro.build/)
-   **UI**: [Preact](https://preactjs.com/) (for interactive islands)
-   **Styling**: Native CSS (Variables, Flexbox/Grid)
-   **Icons**: [Astro Icon](https://www.astroicon.dev/)
-   **Search**: [Pagefind](https://pagefind.app/)
-   **Server**: Nginx

## 📂 Project Structure

```text
/
├── .github/workflows/ # CI/CD (Build, Quality, SonarQube)
├── cv_latex/          # LaTeX source files for CV
├── dist/              # Production build output
├── scripts/           # Post-build processing scripts
│   ├── generate-csp-hashes.mjs  # Updates Nginx CSP config
│   ├── generate-sri-hashes.mjs  # Injects SRI hashes into HTML
│   └── setup-sitemap.mjs        # Sitemap configuration
├── src/
│   ├── assets/        # Images and icons
│   ├── components/    # Astro & Preact components
│   ├── content/       # MDX Blog posts
│   ├── data/          # YAML Configuration
│   ├── layouts/       # Page layouts
│   ├── pages/         # Routes
│   └── styles/        # Global CSS
└── astro.config.mjs   # Astro configuration
```

## 🚀 Getting Started

### Prerequisites

-   Node.js (v18+)
-   pnpm (`npm install -g pnpm`)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/jmrplens/jmrp.io.git
    cd jmrp.io
    ```

2.  **Install dependencies:**
    ```bash
    pnpm install
    ```

3.  **Start development server:**
    ```bash
    pnpm run dev
    ```
    Visit `http://localhost:4321`.

## 🏗️ Building & Deployment

### Production Build

To create a production build:

```bash
pnpm run build
```

**What happens during build:**
1.  **Astro Build**: Compiles the site to static HTML/CSS/JS in `dist/`.
2.  **Pagefind**: Indexes the site for search.
3.  **Post-Processing**:
    -   `extract-css-data-uris.mjs`: Optimizes CSS.
    -   `extract-html-img-data-uris.mjs`: Optimizes inline images.
    -   `generate-sri-hashes.mjs`: Calculates SHA-384 hashes for assets and injects `integrity="..."`.
    -   `generate-csp-hashes.mjs`: Scans for inline scripts/styles, calculates SHA-256 hashes, and updates the Nginx `security_headers.conf` file to enforce strict CSP.

### Nginx Configuration

This project relies on Nginx for serving the static files and enforcing security policies.
The `generate-csp-hashes.mjs` script automatically maintains the CSP headers in `/etc/nginx/snippets/security_headers.conf`.

**Key Security Features:**
-   **SRI (Subresource Integrity)**: Ensures that fetched resources haven't been manipulated.
-   **CSP (Content Security Policy)**: Uses `nonce` and hashes to prevent XSS. Only allowed scripts and styles can execute.
-   **HSTS**: Enforces HTTPS.

## 📄 LaTeX CV Compilation

The project includes LaTeX source files to generate professional PDF CVs.

**Prerequisites:**
-   TeX Live (Full distribution)
-   `latexmk`
-   `lualatex`

**Compilation:**

```bash
cd cv_latex
latexmk -lualatex -interaction=nonstopmode CV_RequenaPlensJoseManuel_ENG.tex CV_RequenaPlensJoseManuel_SPA.tex
```

This generates `CV_RequenaPlensJoseManuel_ENG.pdf` and `CV_RequenaPlensJoseManuel_SPA.pdf`.

## ♿ Accessibility

We take accessibility seriously:
-   **Contrast**: Colors are checked against WCAG AA standards.
-   **Semantic HTML**: Proper use of `<main>`, `<article>`, `<nav>`, etc.
-   **Screen Readers**: `aria-label` used on icon-only buttons; decorative elements hidden with `aria-hidden="true"`.
-   **Keyboard Navigation**: Visible focus rings and logical tab order.
-   **Reduced Motion**: Respects `prefers-reduced-motion` media query.

## 📄 License

This project is open source and available under the **MIT License**.

See the [LICENSE](LICENSE) file for more info.