# jmrp.io - Personal R&D Portfolio

![Astro](https://img.shields.io/badge/astro-5.16.5-orange?style=flat&logo=astro)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Mozilla Observatory Grade](https://img.shields.io/mozilla-observatory/grade/jmrp.io?publish)
![PageSpeed Mobile](https://img.shields.io/badge/PageSpeed%20Mobile-100-brightgreen)
![PageSpeed Desktop](https://img.shields.io/badge/PageSpeed%20Desktop-100-brightgreen)

High-performance, accessibility-first portfolio website for **José Manuel Requena Plens**, R&D Engineer. Built with **Astro**, **Preact**, and **TypeScript**, designed to be fast, secure, and easy to configure.

## 🚀 Features

-   **Performance First**: Core Web Vitals optimized. Zero CLS, LCP < 1.0s.
-   **Security Hardened**: Strict Content Security Policy (CSP) with nonces, HSTS, and security headers. A+ on Mozilla Observatory.
-   **Accessible**: Semantic HTML, ARIA labels, and keyboard navigation support.
-   **Themeable**: Light/Dark mode with system preference detection and reduced motion support.
-   **Configurable**: centralized configuration via YAML files.
-   **SEO Optimized**: Dynamic Schema.org (JSON-LD), Open Graph, and Twitter Cards.

## 🛠️ Tech Stack

-   **Framework**: [Astro](https://astro.build/)
-   **UI**: [Preact](https://preactjs.com/) (for interactive islands)
-   **Styling**: Native CSS (Variables, Flexbox/Grid)
-   **Icons**: [Astro Icon](https://www.astroicon.dev/) (FontAwesome & Material Design)
-   **Search**: [Pagefind](https://pagefind.app/) (Static search indexing)
-   **Server**: Nginx (serving static build)

## 📂 Project Structure

```text
/
├── public/          # Static assets (PDFs, Images, Scripts)
├── src/
│   ├── components/  # Astro & Preact components
│   ├── data/        # Configuration YAMLs (site, cv, socials)
│   ├── layouts/     # Page layouts (BaseLayout)
│   ├── pages/       # Route definitions
│   └── styles/      # Global CSS & Fonts
├── scripts/         # Build scripts (CSP generation)
└── astro.config.mjs # Astro configuration
```

## ⚙️ Configuration

The site is designed to be easily customizable through three main configuration files in `src/data/`:

1.  **`site.yml`**: General site settings.
    -   `logo_text`: Text displayed in the header.
    -   `nav`: Navigation menu items.
    -   `hero`: Home page title, subtitle, and bio.
    -   `author`: Name used for metadata and copyright.

2.  **`socials.yml`**: Social media links.
    -   Add/remove keys like `github_username`, `linkedin_username`, or `matrix_id`.
    -   Footer and Contact sections will update automatically.

3.  **`cv.yml`**: Curriculum Vitae data.
    -   Structured data for Experience, Education, and Skills.
    -   Automatically generates the CV page and `Person` schema.

## 💻 Development

### Prerequisites

-   Node.js (v18+)
-   pnpm

### Commands

| Command | Action |
| :--- | :--- |
| `pnpm install` | Install dependencies |
| `pnpm run dev` | Start local development server at `localhost:4321` |
| `pnpm run build` | Build for production to `./dist/` |
| `pnpm run preview` | Preview production build locally |

## 📦 Deployment

The project is built as a static site.

1.  **Build**:
    ```bash
    pnpm run build
    ```
    *This runs `astro build`, generates search indexes with `pagefind`, and calculates CSP hashes.*

2.  **Web Server (Nginx)**:
    -   Serve the `dist/` folder.
    -   Ensure `nginx/snippets/security_headers.conf` is included for CSP and security headers.
    -   The `styles-src` and `script-src` hashes in `security_headers.conf` are automatically updated by the `postbuild` script.

## 📄 CV LaTeX Compilation

The project includes LaTeX source files for generating the PDF versions of the CV.

### Prerequisites

-   TeX Live (Full distribution recommended)
-   `lualatex` compiler
-   `latexmk` build tool
-   `inter` font package (included in `texlive-fonts-extra`)

### Compilation

Navigate to the `cv_latex` directory and run:

```bash
cd cv_latex
latexmk -lualatex -interaction=nonstopmode CV_RequenaPlensJoseManuel_ENG.tex CV_RequenaPlensJoseManuel_SPA.tex
```

The generated PDFs will be:

-   `CV_RequenaPlensJoseManuel_ENG.pdf`
-   `CV_RequenaPlensJoseManuel_SPA.pdf`

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
