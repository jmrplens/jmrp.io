# JMRP.io (Astro v5)

[![CI](https://github.com/jmrplens/jmrp.io/actions/workflows/ci.yml/badge.svg)](https://github.com/jmrplens/jmrp.io/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=jmrplens_jmrp.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=jmrplens_jmrp.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Astro](https://img.shields.io/badge/Built_with-Astro-ff5a1f.svg)](https://astro.build)

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

- **Axe-core (via Playwright)**: Scans every page against **WCAG 2.1 AA** and **Best Practice** rules. It generates detailed HTML reports (`accessibility-report/`) and fails the build on any violation.
- **Lighthouse CI**: Runs Lighthouse audits on all pages, enforcing high scores for Accessibility, Performance, and SEO.
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

<details>
<summary><strong>📄 example.com.conf (Snippet)</strong></summary>

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name example.com;
    return 301 https://$host$request_uri;
}

server {
    server_name example.com;

    # Listen on standard HTTPS ports + QUIC/HTTP3
    listen 443 ssl;
    listen [::]:443 ssl;
    listen 443 quic;
    listen [::]:443 quic;

    root /var/www/example.com/dist;
    index index.html;

    # SSL Settings
    ssl_certificate /etc/ssl/certs/example.com.crt;
    ssl_certificate_key /etc/ssl/private/example.com.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Alt-Svc 'h3=":443"' always;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # CSP Nonce Generation
    set $cspNonce $request_id;
    sub_filter_once off;
    sub_filter_types *;
    sub_filter NGINX_CSP_NONCE $cspNonce;

    # Security Headers (Includes CSP with Nonce)
    include /etc/nginx/snippets/security_headers.conf;

    # Caching Strategies
    location /_astro/ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }

    location / {
        try_files $uri $uri/ =404;
        add_header Cache-Control "public, max-age=3600, must-revalidate";
    }

    # Block access to hidden files
    location ~ /\. {
        deny all;
    }
}
```

</details>

<details>
<summary><strong>🔒 security_headers.conf (Generated/Managed)</strong></summary>

_This file is automatically updated by `npm run build` to include the correct SHA-256 hashes for inline scripts and styles._

```nginx
# HSTS (Strict Transport Security)
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

# Anti-Sniffing
add_header X-Content-Type-Options "nosniff" always;

# Frame Options (Prevent Clickjacking)
add_header X-Frame-Options "DENY" always;

# XSS Protection
add_header X-XSS-Protection "1; mode=block" always;

# Referrer Policy
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

# Content Security Policy (CSP)
# - 'nonce-$cspNonce': Allows scripts with the matching nonce (injected by Nginx)
# - 'strict-dynamic': Trust scripts loaded by trusted scripts
# - hashes: Allow specific inline scripts/styles found during build
# - 'report-uri': Instructs the browser to send CSP violation reports to the given endpoint (here, /csp-report)
# - 'require-trusted-types-for': Enforces Trusted Types for the specified sinks (here, 'script') to mitigate DOM-based XSS
# - 'trusted-types': Defines which Trusted Types policies are allowed (here, only the 'default' policy)
add_header Content-Security-Policy "default-src 'none'; script-src 'self' 'strict-dynamic' 'nonce-$cspNonce' 'sha256-...' 'sha256-...'; style-src 'self' 'nonce-$cspNonce' 'sha256-...'; img-src 'self' https:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests; report-uri /csp-report; require-trusted-types-for 'script'; trusted-types default;" always;
```

</details>

**Key Security Features:**

- **SRI (Subresource Integrity)**: Ensures that fetched resources haven't been manipulated.
- **CSP (Content Security Policy)**: Uses `nonce` and hashes to prevent XSS. Only allowed scripts and styles can execute.
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
