# Plan de Implementación i18n — jmrp.io

> **Rama**: `feat/i18n`  
> **Idiomas**: Inglés (default, sin prefijo) + Español (`/es/`)  
> **Estrategia de routing**: Prefix-based (Astro native i18n)  
> **Enfoque**: Manual (Astro native + recipe pattern) — sin dependencias externas  
> **Fecha de creación**: 2026-02-17  
> **Última revisión**: 2026-02-17 (post-investigación)  
> **Referencia técnica**: [`docs/I18N_RESEARCH.md`](./I18N_RESEARCH.md)

---

## Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Arquitectura i18n](#2-arquitectura-i18n)
3. [Fase 0 — Infraestructura Base](#3-fase-0--infraestructura-base)
4. [Fase 1 — Layouts y Navegación](#4-fase-1--layouts-y-navegación)
5. [Fase 2 — Páginas Principales](#5-fase-2--páginas-principales)
6. [Fase 3 — Componentes UI](#6-fase-3--componentes-ui)
7. [Fase 4 — Contenido Estático (YAML)](#7-fase-4--contenido-estático-yaml)
8. [Fase 5 — Content Collections (MDX)](#8-fase-5--content-collections-mdx)
9. [Fase 6 — Preact Islands (Homelab)](#9-fase-6--preact-islands-homelab)
10. [Fase 7 — Tools Interactivos (Apps)](#10-fase-7--tools-interactivos-apps)
11. [Fase 8 — SEO, RSS y PWA](#11-fase-8--seo-rss-y-pwa)
12. [Fase 9 — Tests y QA](#12-fase-9--tests-y-qa)
13. [Fase 10 — Documentación y CI](#13-fase-10--documentación-y-ci)
14. [Inventario Completo de Strings](#14-inventario-completo-de-strings)
15. [Decisiones de Diseño](#15-decisiones-de-diseño)
16. [Riesgos y Mitigaciones](#16-riesgos-y-mitigaciones)
17. [Consideraciones Nuevas (Post-Investigación)](#17-consideraciones-nuevas-post-investigación)

---

## 1. Resumen Ejecutivo

### Estado actual

- La configuración i18n ya existe en `astro.config.mjs` (`defaultLocale: "en"`, `locales: ["en", "es"]`)
- **No hay routing i18n activo** — no existen páginas en `/es/`
- **No existe sistema de traducciones** — todos los strings de UI están hardcodeados en inglés
- **No existe contenido en español** — ni posts, ni tools, ni CV

### Dimensión del trabajo

| Categoría                | ~Strings únicos     | Complejidad  |
| ------------------------ | ------------------- | ------------ |
| Infraestructura i18n     | —                   | Media        |
| Layouts y navegación     | ~15                 | Baja         |
| Páginas (UI text)        | ~80                 | Media        |
| Páginas (metadata/SEO)   | ~40                 | Media        |
| Componentes UI           | ~50                 | Baja         |
| ARIA/Accesibilidad       | ~60                 | Media        |
| Preact Islands (Homelab) | ~70                 | Alta         |
| Contenido site_config    | ~30                 | Baja         |
| CV YAML                  | ~200+               | Alta         |
| Publications utils       | ~4                  | Baja         |
| 14 Tools (apps)          | ~500+               | **Muy alta** |
| 8 Blog posts MDX         | Miles de palabras   | **Altísima** |
| 14 Tools MDX docs        | Cientos de palabras | Alta         |
| RSS/PWA/manifest         | ~10                 | Baja         |
| Tests                    | ~20                 | Media        |

### Rutas resultantes

| Inglés (default)           | Español                       |
| -------------------------- | ----------------------------- |
| `/`                        | `/es/`                        |
| `/blog/`                   | `/es/blog/`                   |
| `/blog/[slug]/`            | `/es/blog/[slug]/`            |
| `/blog/tags/[tag]/`        | `/es/blog/tags/[tag]/`        |
| `/cv/`                     | `/es/cv/`                     |
| `/github/`                 | `/es/github/`                 |
| `/homelab/`                | `/es/homelab/`                |
| `/publications/`           | `/es/publications/`           |
| `/tools/`                  | `/es/tools/`                  |
| `/tools/[slug]/`           | `/es/tools/[slug]/`           |
| `/tools/categories/[cat]/` | `/es/tools/categories/[cat]/` |
| `/404`                     | `/es/404`                     |
| `/rss.xml`                 | `/es/rss.xml`                 |

---

## 2. Arquitectura i18n

### 2.1 Estructura de directorios propuesta

```plaintext
src/
├── i18n/
│   ├── config.ts              # Locales, defaultLocale, tipos
│   ├── utils.ts               # t(), getLocale(), getLocalizedUrl(), formatDate()
│   ├── translations/
│   │   ├── en/
│   │   │   ├── common.ts      # Nav, footer, skip link, theme toggle
│   │   │   ├── pages.ts       # Textos de cada página
│   │   │   ├── components.ts  # Labels UI components
│   │   │   ├── aria.ts        # ARIA labels y accesibilidad
│   │   │   ├── seo.ts         # Meta descriptions, JSON-LD
│   │   │   └── tools.ts       # Labels de tools interactivos
│   │   ├── es/
│   │   │   ├── common.ts
│   │   │   ├── pages.ts
│   │   │   ├── components.ts
│   │   │   ├── aria.ts
│   │   │   ├── seo.ts
│   │   │   └── tools.ts
│   │   └── index.ts           # Barrel export con type-safe keys
│   └── middleware.ts          # Locale detection (si se necesita SSR)
├── pages/
│   ├── index.astro            # Inglés (default)
│   ├── blog/...
│   ├── es/                    # Español (prefixed)
│   │   ├── index.astro
│   │   ├── blog/...
│   │   ├── cv.astro
│   │   └── ...
├── content/
│   ├── posts/
│   │   ├── en/               # Posts en inglés
│   │   │   ├── 001-secure-nginx-client-certificates.mdx
│   │   │   └── ...
│   │   └── es/               # Posts en español
│   │       ├── 001-secure-nginx-client-certificates.mdx
│   │       └── ...
│   ├── tools/
│   │   ├── en/               # Tools MDX en inglés
│   │   └── es/               # Tools MDX en español
│   ├── cv/
│   │   ├── en.yaml           # CV en inglés
│   │   └── es.yaml           # CV en español
│   └── site_config/
│       ├── site.yaml          # Config compartida (no traducible)
│       ├── site.en.yaml       # Strings traducibles EN
│       └── site.es.yaml       # Strings traducibles ES
```

### 2.2 Función de traducción `t()`

```typescript
// src/i18n/utils.ts
import type { Locale } from "./config";
import { getRelativeLocaleUrl } from "astro:i18n";

// Patrón basado en el recipe oficial de Astro
export function getLangFromUrl(url: URL): Locale;
export function useTranslations(lang: Locale): (key: TranslationKey) => string;
export function useTranslatedPath(
  lang: Locale,
): (path: string, l?: Locale) => string;

// Helpers adicionales
export function getAlternateUrls(
  path: string,
): { locale: Locale; url: string }[];
export function formatDate(date: Date, locale: Locale): string; // Intl.DateTimeFormat
export function formatNumber(num: number, locale: Locale): string; // Intl.NumberFormat
export function pluralize(
  count: number,
  singular: string,
  plural: string,
  locale: Locale,
): string; // Intl.PluralRules
```

**Nota**: Usar `getRelativeLocaleUrl()` de `astro:i18n` en lugar de implementar URL generation manual. Astro ya sabe cómo construir URLs con/sin prefijo según la configuración.

### 2.3 Path alias

Añadir `@i18n/*` → `src/i18n/*` en `tsconfig.json`.

### 2.4 Estrategia de routing

**Opción elegida**: Astro native i18n con prefix-based routing.

- `en` (default): sin prefijo → `/blog/`, `/cv/`
- `es`: con prefijo → `/es/blog/`, `/es/cv/`

**Configuración completa de `astro.config.mjs`:**

```javascript
i18n: {
  defaultLocale: "en",
  locales: ["en", "es"],
  routing: {
    prefixDefaultLocale: false,   // EN sin prefijo (/)
  },
}
```

**Nota sobre `fallback` a nivel de routing:**

- `i18n.fallback` de Astro genera redirects/rewrites automáticos que pueden conflictuar con páginas ES que existen. Se omite del config.
- El fallback se maneja **a nivel de contenido** (query de colecciones) → muestra contenido EN con banner y `lang="en"` en el `<article>`.
- `fallbackType: "redirect"` tampoco se usa — los redirects manuales dan más control.

**Decisiones de routing:**

1. Páginas de `/es/` son wrapper pages (componente compartido + locale prop)
2. `Astro.currentLocale` como fuente primaria del locale actual (disponible en SSG y SSR)
3. `getRelativeLocaleUrl()` de `astro:i18n` para generar URLs localizadas

---

## 3. Fase 0 — Infraestructura Base

> **Objetivo**: Crear el sistema de traducciones, utilidades i18n, y configurar el routing.

### Checklist

- [x] **0.1** Crear directorio `src/i18n/` con estructura base ✅ `b2d496c`
- [x] **0.2** Crear `src/i18n/config.ts`: ✅ `b2d496c`
  - [x] Definir tipo `Locale = "en" | "es"`
  - [x] Definir `defaultLocale`, `locales`, `localeLabels`
  - [x] Definir tipo `LocaleConfig` con nombre del idioma, dirección, date locale
- [x] **0.3** Crear `src/i18n/utils.ts` (basado en el recipe oficial de Astro): ✅ `b2d496c`
  - [x] Implementar `getLangFromUrl(url: URL): Locale` — extrae locale de la URL
  - [x] Implementar `useTranslations(lang: Locale)` — retorna función `t(key)` type-safe
  - [x] Implementar `useTranslatedPath(lang: Locale)` — retorna función para generar paths localizados
  - [x] Implementar `getAlternateLinks(path, siteUrl)` — para hreflang (nombrada `getAlternateLinks` en vez de `getAlternateUrls`)
  - [x] Implementar `formatDate(date, locale): string` — usar `Intl.DateTimeFormat` (no `toLocaleDateString`)
  - [x] Implementar `formatNumber(num, locale): string` — usar `Intl.NumberFormat`
  - [x] Implementar `pluralize(count, forms, locale): string` — usar `Intl.PluralRules`
- [x] **0.4** Crear `src/i18n/translations/en/common.ts` — ~120 keys con nav, ui, aria, seo, pages ✅ `b2d496c`
- [x] **0.5** Crear `src/i18n/translations/es/common.ts` — traducción española completa ✅ `b2d496c`
- [x] **0.6** Crear `src/i18n/translations/index.ts` — barrel export con types ✅ `b2d496c`
- [x] **0.7** Añadir path alias `@i18n` en `tsconfig.json` ✅ `b2d496c`
- [x] **0.8** Actualizar `astro.config.mjs`: ✅ `b2d496c`
  - [x] Configurar `i18n.routing`: `{ prefixDefaultLocale: false }`
  - [x] NO usar `i18n.fallback` (conflictos con páginas ES existentes — fallback a nivel de contenido)
  - [x] Verificar `@astrojs/sitemap` i18n config (configurado con `defaultLocale` + `locales`)
  - [x] Verificar compatibilidad con Astro 6 beta
- [x] **0.9** Crear componente `LanguageSwitcher.astro`: ✅ `b2d496c`
  - [x] Link `<a>` para cambiar idioma (sin JS, funciona sin hydration)
  - [x] Preservar la ruta actual al cambiar idioma (usa `stripLocalePrefix`)
  - [x] Accesible (ARIA label, `hreflang`, `lang` en el enlace)
  - [x] Integrar en Header (desktop + mobile menu)
- [x] **0.10** Crear script de detección automática de idioma (client-side): ✅ `b2d496c`
  - [x] Detectar `navigator.language` / `navigator.languages` (`LanguageDetector.astro`)
  - [x] Redirigir a `/es/` en primera visita si idioma del navegador es `es*`
  - [x] Respetar elección manual del usuario (guardar en `localStorage`)
  - [x] No redirigir si el usuario ya está en la versión correcta
  - [x] Inyectar en `BaseLayout.astro` (componente `<LanguageDetector />`)
- [x] **0.11** Crear helper para páginas: patrón de wrapper page ✅ `8523646`
  ```astro
  ---
  // src/pages/es/index.astro — wrapper que importa componente compartido
  ---
  ```
- [x] **0.12** Documentar el patrón de uso para desarrolladores ✅ `docs/I18N_GUIDE.md`
- [x] **0.13** Tests E2E para i18n (`t()`, lang, hreflang, og:locale, JSON-LD) ✅ `tests/i18n.spec.ts` (476 líneas)

### Decisiones resueltas en Fase 0

- **D0.1** → **Wrapper pages**: Páginas mínimas en `/es/` que importan componente compartido (sin prop `locale` — usa `Astro.currentLocale`)
- **D0.2** → **TypeScript** (`.ts`): con `as const` para type-safety, permite comentarios e interpolación
- **D0.3** → **Nested** con dot-notation flatten para la función `t()`: `{ nav: { home: "..." } }` → `t("nav.home")`

### Estado de Fase 0

> **11/13 completados** — Commits: `b2d496c`, `8523646`
>
> **Pendiente:**
>
> - **0.12**: Documentación del patrón de uso para desarrolladores
> - **0.13**: Tests unitarios para `t()`, `getLangFromUrl()`, `useTranslatedPath()`
>
> **Implementación real vs plan:**
>
> - `getAlternateUrls()` se implementó como `getAlternateLinks(pathname, siteUrl)` (incluye `x-default`)
> - `pluralize()` recibe `forms: Record<PluralRule, string>` en vez de key de traducción
> - Se añadió `getOgLocale()` (no estaba en plan original)
> - Se añadió `stripLocalePrefix()` como helper público
> - Se creó `src/i18n/index.ts` como barrel module adicional
> - `LanguageSwitcher` es un `<a>` puro (no dropdown), sin JS
> - `LanguageDetector` es componente separado inyectado en BaseLayout
> - En Fase posterior (`8523646`): se extrajeron 12 componentes compartidos en `src/components/pages/` y se redujo todo a wrappers

---

## 4. Fase 1 — Layouts y Navegación

> **Objetivo**: Hacer que layouts y navegación soporten ambos idiomas.

### Checklist

- [x] **1.1** `src/layouts/BaseLayout.astro`: ✅ `c634d48`
  - [x] `<html lang="en">` → `<html lang={locale}>` dinámico
  - [x] `"Skip to content"` → `t("ui.skipToContent")`
  - [x] Derivar locale de `Astro.currentLocale`
  - [x] Añadir `<link rel="alternate" hreflang="...">` (via BaseHead `getAlternateLinks`)
  - [x] Añadir `hreflang="x-default"` apuntando a inglés
- [x] **1.2** `src/layouts/ToolLayout.astro`: ✅ `c634d48`
  - [x] `"Tools"` breadcrumb → `t("nav.tools")`
  - [x] `aria-label="Breadcrumb"` → `t("aria.breadcrumb")`
  - [x] `"Web Browser"`, `"USD"` en JSON-LD — mantenidos en inglés (valores universales)
- [x] **1.3** `src/components/layout/BaseHead.astro`: ✅ `c634d48`
  - [x] `"JMRP"` suffix → mantenido (nombre propio)
  - [x] `"Home"` breadcrumb JSON-LD → `t("nav.home")`
  - [x] `"JMRP Blog RSS Feed"` → `t("seo.rssFeedTitle")`
  - [x] `hreflang` alternate links en `<head>` (con `getAlternateLinks()`)
  - [x] `og:locale` y `og:locale:alternate` (con `getOgLocale()`)
- [x] **1.4** `src/components/layout/Header.astro`: ✅ `c634d48`
  - [x] `aria-label="Main Navigation"` → `t("aria.mainNav")`
  - [x] `aria-label="Home - JMRP"` → `t("aria.homeLogo")`
  - [x] `aria-label="Toggle Navigation"` → `t("aria.toggleNav")`
  - [x] Nav labels dinámicas desde site_config traducido
  - [x] Integrar `LanguageSwitcher` en el header
  - [x] Mobile menu: también incluir language switcher
- [x] **1.5** `src/components/layout/Footer.astro`: ✅ `c634d48`
  - [x] `"All rights reserved."` → `t("ui.copyright", { year, author })`
  - [x] `` `Visit my ${link.label} profile` `` → `t("aria.visitProfile", { name: link.label })`
- [x] **1.6** `src/components/layout/TableOfContentsDrawer.astro`: ✅ `c634d48`
  - [x] `"Table of Contents"` (h2) → `t("aria.tableOfContents")`
  - [x] `aria-label="Table of Contents"` → `t("aria.tableOfContents")`
  - [x] `aria-label="Close"` → `t("aria.close")`
  - [x] `aria-label="Table of Contents Drawer"` → `t("aria.tocDrawer")`

### Estado de Fase 1

> **6/6 completados** — Commit: `c634d48`
>
> Todos los layouts y componentes de navegación usan `useTranslations()` con `Astro.currentLocale`.
> Los hreflang, og:locale y alternate links están implementados en BaseHead.

### Archivos afectados

| Archivo                                             | Strings a traducir  |
| --------------------------------------------------- | ------------------- |
| `src/layouts/BaseLayout.astro`                      | 2                   |
| `src/layouts/ToolLayout.astro`                      | 3                   |
| `src/components/layout/BaseHead.astro`              | 3+ meta tags        |
| `src/components/layout/Header.astro`                | 3 ARIA + nav labels |
| `src/components/layout/Footer.astro`                | 2                   |
| `src/components/layout/TableOfContentsDrawer.astro` | 4                   |

---

## 5. Fase 2 — Páginas Principales

> **Objetivo**: Traducir todas las páginas y crear las versiones `/es/`.

### 5.1 Homepage (`index.astro`)

- [x] **2.1.1** `"View CV"` → `t("pages.home.viewCV")` ✅ `bed8289`
- [x] **2.1.2** `"Read Blog"` → `t("pages.home.readBlog")` ✅
- [x] **2.1.3** `"Projects"` → `t("pages.home.projects")` ✅
- [x] **2.1.4** `"Homelab"` → `t("pages.home.homelab")` ✅
- [x] **2.1.5** `"Latest from the Blog"` → `t("pages.home.latestFromBlog")` ✅
- [x] **2.1.6** `"View all posts →"` → `t("pages.home.viewAllPosts")` ✅
- [x] **2.1.7** `"Featured Projects"` → `t("pages.home.featuredProjects")` ✅
- [x] **2.1.8** `"View all repositories →"` → `t("pages.home.viewAllRepos")` ✅
- [x] **2.1.9** Todos los `aria-label` de los CTAs ✅
- [x] **2.1.10** Hero content: cargarlo desde site_config traducido ✅
- [x] **2.1.11** Crear `src/pages/es/index.astro` ✅ wrapper → `<HomePage />`

### 5.2 Blog Index (`blog/index.astro`)

- [x] **2.2.1** `"Blog"` (h1) → `t("pages.blog.title")` ✅ `bed8289`
- [x] **2.2.2** `"Thoughts, tutorials, and engineering notes."` → `t("pages.blog.subtitle")` ✅
- [x] **2.2.3** Disclaimer de AI → `t("pages.blog.aiDisclaimer")` ✅
- [x] **2.2.4** JSON-LD metadata ✅
- [x] **2.2.5** Meta description → `t("pages.blog.description")` ✅
- [x] **2.2.6** Filtrar posts por locale ✅ `c3a377b` (completado en Fase 5 — `getPostsForLocale()`)
- [x] **2.2.7** Crear `src/pages/es/blog/index.astro` ✅ wrapper → `<BlogIndex />`

### 5.3 Blog Post (`blog/[...slug].astro`)

- [x] **2.3.1** `"← Back to Blog"` → `t("pages.blogPost.backToBlog")` ✅ `bed8289`
- [x] **2.3.2** `toLocaleDateString("en-US", ...)` → `formatDate(date, locale)` ✅
- [x] **2.3.3** `aria-label` de tags → `t("aria.viewTaggedPosts", { tag })` ✅
- [x] **2.3.4** `"Read article →"` → `t("aria.readArticle", { title })` ✅
- [x] **2.3.5** Resolver posts por locale en `getStaticPaths` ✅ `c3a377b` (completado en Fase 5)
- [x] **2.3.6** Crear `src/pages/es/blog/[...slug].astro` ✅ wrapper → `<BlogPost post={post} />`

### 5.4 Blog Tags (`blog/tags/[tag].astro`)

- [x] **2.4.1** `` `${count} articles about ${tag}` `` → pluralización con `t()` + `pluralize()` ✅ `bed8289`
- [x] **2.4.2** `"article"/"articles"` y `"post"/"posts"` → `t("pages.blogTags.articleSingular/Plural")` ✅
- [x] **2.4.3** `"← Back to all posts"` → `t("pages.blogTags.backToAllPosts")` ✅
- [x] **2.4.4** Crear `src/pages/es/blog/tags/[tag].astro` ✅ wrapper → `<BlogTagPage />`

### 5.5 CV (`cv.astro`)

- [x] **2.5.1** `"Curriculum Vitae"` (h1) → `t("pages.cv.heading")` ✅ `bed8289`
- [x] **2.5.2** Section titles: traducidos via `t()` ✅
- [x] **2.5.3** Meta description → `t("pages.cv.description")` ✅
- [x] **2.5.4** JSON-LD schema ✅
- [x] **2.5.5** Cargar `cv/en.yaml` o `cv/es.yaml` según locale ✅ `e516e42` (completado en Fase 4 — `getCVData(locale)`)
- [x] **2.5.6** Crear `src/pages/es/cv.astro` ✅ wrapper → `<CVPage />`

### 5.6 GitHub (`github.astro`)

- [x] **2.6.1** `"GitHub Repositories"` → `t("pages.github.title")` ✅ `bed8289`
- [x] **2.6.2** `"Open Source Enthusiast"` → `t("pages.github.bioFallback")` ✅
- [x] **2.6.3** `"Repositories"`, `"Followers"`, `"Following"` → `t("pages.github.*")` ✅
- [x] **2.6.4** Meta description y JSON-LD ✅
- [x] **2.6.5** Crear `src/pages/es/github.astro` ✅ wrapper → `<GitHubPage />`

### 5.7 Homelab (`homelab.astro`)

- [x] **2.7.1** `"Homelab Status"` → `t("pages.homelab.title")` ✅ `bed8289`
- [x] **2.7.2** Párrafo introductorio → `t("pages.homelab.intro")` ✅
- [x] **2.7.3** Service descriptions → `t("pages.homelab.mastodonDescription")` etc. ✅
- [x] **2.7.4** `"User:"` → `t("pages.homelab.userLabel")` ✅
- [x] **2.7.5** `"Node: NGINX..."` → `t("pages.homelab.nginxNode")` ✅
- [x] **2.7.6** Link texts → `t("pages.homelab.mastodonLink/matrixLink/meshtasticLink")` ✅
- [x] **2.7.7** Meta description → `t("pages.homelab.description")` ✅
- [x] **2.7.8** Crear `src/pages/es/homelab.astro` ✅ wrapper → `<HomelabPage />`

### 5.8 Publications (`publications.astro`)

- [x] **2.8.1** `"Publications"` → `t("pages.publications.title")` ✅ `bed8289`
- [x] **2.8.2** Meta description y JSON-LD ✅
- [x] **2.8.3** Publication group titles en `utils/publications.ts`: ✅ `e516e42` (completado en Fase 4 — `getPublications(locale)` usa `t()`)
  - `"Journal articles"` → `"Artículos de revista"` ✅
  - `"Conference and workshop papers"` → `"Artículos de conferencia y talleres"` ✅
  - `"Thesis"` → `"Tesis"` ✅
  - `"Other"` → `"Otros"` ✅
- [x] **2.8.4** Crear `src/pages/es/publications.astro` ✅ wrapper → `<PublicationsPage />`

### 5.9 Tools Index (`tools/index.astro`)

- [x] **2.9.1** `"Developer Tools"` → `t("pages.tools.title")` ✅ `bed8289`
- [x] **2.9.2** Intro text → `t("pages.tools.intro")` ✅
- [x] **2.9.3** Category names → `t("pages.tools.categorySecurity/Developer/Network/Embedded/Mikrotik")` ✅
- [x] **2.9.4** Meta description y JSON-LD ✅
- [x] **2.9.5** Crear `src/pages/es/tools/index.astro` ✅ wrapper → `<ToolsIndex />`

### 5.10 Tools Categories (`tools/categories/[category].astro`)

- [x] **2.10.1** Category names y descriptions → `t("pages.tools.category*")` ✅ `bed8289`
- [x] **2.10.2** `"Tools"` breadcrumb → `t("nav.tools")` ✅
- [x] **2.10.3** `"tool"/"tools"` pluralización → `t("pages.toolsCategory.toolSingular/Plural")` ✅
- [x] **2.10.4** `"← Back to all tools"` → `t("pages.toolsCategory.backToTools")` ✅
- [x] **2.10.5** Crear `src/pages/es/tools/categories/[category].astro` ✅ wrapper → `<ToolCategoryPage />`

### 5.11 Tool Detail (`tools/[...slug].astro`)

- [x] **2.11.1** Resolver tools por locale en `getStaticPaths` ✅ `c3a377b` (completado en Fase 5 — `getToolsForLocale()`)
- [x] **2.11.2** Breadcrumb labels → ToolLayout ya usa `t("nav.tools")` y `t("aria.breadcrumb")` ✅
- [x] **2.11.3** Crear `src/pages/es/tools/[...slug].astro` ✅ wrapper → `<ToolPage tool={tool} />`

### 5.12 404 (`404.astro`) — Un 404 por locale (D7)

- [x] **2.12.1** `"404: Ah ah ah!"` → `t("pages.notFound.title")` (mantenido en ambos idiomas) ✅ `bed8289`
- [x] **2.12.2** `"Page Not Found"` → `t("pages.notFound.pageNotFound")` ✅
- [x] **2.12.3** `"You didn't say the magic word"` → `t("pages.notFound.message")` ✅
- [x] **2.12.4** `"← Go Home"` → `t("pages.notFound.goHome")` ✅
- [x] **2.12.5** Crear `src/pages/es/404.astro` ✅ wrapper → `<NotFoundPage />`

### Estado de Fase 2

> **Completada al 100%** — Commits: `bed8289`, `8523646`, `e516e42`, `c3a377b`
>
> **Arquitectura final**: 12 componentes compartidos en `src/components/pages/` + 24 wrappers mínimos (12 EN + 12 ES).
> Los componentes usan `Astro.currentLocale` internamente — sin prop drilling de locale.
>
> **Items resueltos en fases posteriores:**
>
> - **2.2.6**: Filtrar posts por locale → ✅ `c3a377b` (Fase 5 — `getPostsForLocale()`)
> - **2.3.5**: Resolver posts por locale en getStaticPaths → ✅ `c3a377b` (Fase 5)
> - **2.5.5**: Cargar CV YAML por locale → ✅ `e516e42` (Fase 4 — `getCVData(locale)`)
> - **2.8.3**: Publication group titles traducidos → ✅ `e516e42` (Fase 4 — `getPublications(locale)`)
> - **2.11.1**: Resolver tools por locale en getStaticPaths → ✅ `c3a377b` (Fase 5)

---

## 6. Fase 3 — Componentes UI ✅

> **Objetivo**: Traducir todos los labels, ARIA y defaults de los 35 componentes UI.
> **Estado**: ✅ Completada — 31 componentes traducidos (18 del plan + 13 adicionales descubiertos en auditoría)

### Checklist

- [x] **3.1** `ThemeToggle.astro`:
  - [x] `aria-label="Toggle theme"` → `t("aria.toggleTheme")`
  - [x] JS dynamic: `"Switch to dark/light theme"` → inyectado vía `data-label-light`/`data-label-dark`
- [x] **3.2** `CopyButton.astro`:
  - [x] `"Copy to clipboard"` → `t("components.copyButton.ariaLabel")`
  - [x] `"Copied!"` (JS feedback) → inyectado vía `data-msg-copied`/`data-msg-failed`/`data-msg-unavailable`
- [x] **3.3** `Callout.astro`:
  - [x] `` `${type} callout` `` → `t("components.callout.{type}")`
  - [x] `` `${type}:` `` → screen reader prefix traducido con record `typeLabels`
- [x] **3.4** `TLDRSummary.astro`:
  - [x] `title = "TL;DR"` → `t("components.tldr.title")` (EN: "TL;DR", ES: "Resumen")
- [x] **3.5** `Collapsible.astro`:
  - [x] `"Details"` default → `t("components.collapsible.defaultSummary")`
- [x] **3.6** `StepByStep.astro`:
  - [x] `aria-label="Step-by-step guide"` → `t("aria.stepByStep")`
- [x] **3.7** `CheckList.astro`:
  - [x] `aria-label="Checklist"` → `t("aria.checklist")`
- [x] **3.8** `Prerequisite.astro`:
  - [x] `title = "Prerequisites"` → `t("components.prerequisite.title")`
- [x] **3.9** `BrowserSupport.astro`:
  - [x] `"Browser Support"` → `t("components.browserSupport.title")`
  - [x] `"Full Support"`, `"Partial Support"`, `"No Support"`, `"Unknown"` → traducidos
- [x] **3.10** `References.astro`:
  - [x] `"Further Reading & Resources"` → `t("components.references.title")`
- [x] **3.11** `DeprecatedNotice.astro`:
  - [x] `"Deprecated"`, `"is deprecated"`, `"and will be removed in"`, `"Use instead:"` → traducidos (5 claves)
- [x] **3.12** `StateNotice.astro`:
  - [x] Labels: 6 tipos + mensajes de eliminación → traducidos (19 claves con records `stateMessages`/`removalMessages`)
- [x] **3.13** `VersionBadge.astro`:
  - [x] `prefix: "Level"` → `t("components.versionBadge.level")`
- [x] **3.14** `Tabs.astro`:
  - [x] `` `Show ${label} tab` `` → `t("components.tabs.showTab", { label })`
- [x] **3.15** `APIEndpoint.astro`:
  - [x] `aria-label="Authentication required"` → `t("components.apiEndpoint.authAria")`
- [x] **3.16** `FileContent.astro`:
  - [x] `` `Code content for ${filename}` `` → `t("components.fileContent.codeAria", { filename })`
  - [x] Copy labels traducidos
- [x] **3.17** `BeforeAfter.astro`:
  - [x] `` `Comparison: ${before} vs ${after}` `` → `t("components.beforeAfter.comparisonAria", ...)`
- [x] **3.18** `DirectiveCard.astro`:
  - [x] `` `MDN documentation for ${name}` `` → `t("components.directiveCard.mdnAria", { name })`
  - [x] Labels "Syntax" y "Default" traducidos

### Componentes adicionales (descubiertos en auditoría)

- [x] **3.19** `Code.astro` — aria-labels y copy button traducidos
- [x] **3.20** `TerminalCommand.astro` — aria-labels y copy button traducidos
- [x] **3.21** `TerminalOutput.astro` — aria-labels traducidos
- [x] **3.22** `TerminalSession.astro` — session aria-label y copy button traducidos
- [x] **3.23** `TerminalSessionCommand.astro` — aria-labels traducidos
- [x] **3.24** `TerminalSessionOutput.astro` — aria-labels traducidos
- [x] **3.25** `TabPanel.astro` — copy button aria-label traducido
- [x] **3.26** `Table.astro` — fallback aria-label "Data table" traducido
- [x] **3.27** `SecurityRating.astro` — 7 rating labels + aria-label traducidos
- [x] **3.28** `BarChart.astro` — aria-labels con/sin título traducidos
- [x] **3.29** `Timeline.astro` — type labels (Standard, Deprecated, Milestone) traducidos
- [x] **3.30** `YouTube.astro` — default title "YouTube Video" traducido
- [x] **3.31** `Mermaid.astro` — fallback aria-label traducido

### Reto: Pasar `locale` a componentes UI

Los componentes `.astro` se renderizan en build time. El locale se puede:

1. **Usar `Astro.currentLocale`** (API nativa de Astro i18n — **preferida**, disponible en SSG y SSR)
2. **Derivar de `Astro.url`** con `getLangFromUrl(Astro.url)` (fallback si `currentLocale` no está disponible)
3. **Pasar como prop** desde el layout/page (solo si el componente no tiene acceso a `Astro`)

**Decisión**: Usar `Astro.currentLocale` como fuente primaria. Es la API oficial y no requiere prop drilling.

```astro
---
// En cualquier componente .astro
const locale = (Astro.currentLocale ?? "en") as Locale;
const t = useTranslations(locale);
---

<nav aria-label={t("aria.mainNav")}>...</nav>
```

---

## 7. Fase 4 — Contenido Estático (YAML)

> **Objetivo**: Organizar el contenido YAML para soportar múltiples idiomas.

### 7.1 Site Config

> **Decisión de implementación**: En lugar de crear `site.en.yaml` / `site.es.yaml` separados, se movieron los campos traducibles directamente a las traducciones i18n (`common.ts`). El YAML conserva solo datos compartidos no traducibles.

- [x] **4.1.1** Separar `site.yaml` en datos compartidos + datos traducibles: ✅
  - **Compartido** (no traducible, se mantiene en YAML): `url`, `theme_color`, `background_color`, `social_links`, `fediverse_creator`, `twitter_creator`, `logo_text`, `featured_projects`, `author`, `nav[].href`
  - **Traducible** (movido a `i18n/translations/`): `title` → `seo.siteTitle`, `description` → `seo.siteDescription`, `keywords` → `seo.siteKeywords`, `nav[].label` → `nav.*`, `hero.*` → `pages.home.hero*`, `shortcuts[]` → `pwa.shortcut*`, `person.jobTitle` → `seo.jobTitle`
- [x] **4.1.2** ~~Crear `site.en.yaml`~~ → Strings EN en `en/common.ts` ✅
- [x] **4.1.3** ~~Crear `site.es.yaml`~~ → Strings ES en `es/common.ts` ✅
- [x] **4.1.4** ~~Actualizar `content.config.ts`~~ → No necesario (YAML no cambia de estructura) ✅
- [x] **4.1.5** Actualizar consumers para usar `t()`:
  - `Header.astro` → `navLabelKeyMap` + `t()` para labels de nav ✅
  - `BaseHead.astro` → `t("seo.siteDescription")`, `t("seo.siteKeywords")`, `t("seo.siteTitle")` para JSON-LD y meta ✅
  - `HomePage.astro` → Hero content desde `t()`, title/description/jobTitle desde `t()` ✅
  - `site.webmanifest.ts` → `t("pwa.shortcut*")`, `localeConfig` para lang/dir ✅
  - `rss.xml.ts` → `t("seo.siteTitle")`, `t("rss.continueReading")`, `t("rss.copyright")` ✅

### 7.2 CV

- [x] **4.2.1** Renombrar `main.yaml` → `en.yaml` ✅
- [x] **4.2.2** Crear `es.yaml` con CV en español: ✅
  - [x] Section titles traducidos ✅
  - [x] Experience descriptions traducidas ✅
  - [x] Skill levels (numéricos mantenidos, labels traducidos) ✅
  - [x] Certificate names (traducidos, cursos IT en inglés original) ✅
  - [x] Map items: "Nombre completo", "Idiomas", "Descargar CV" ✅
- [x] **4.2.3** Actualizar `getCVData(locale)` en `utils/cv.ts` con fallback al locale por defecto ✅
- [x] **4.2.4** Actualizar `CVPage.astro`: eliminar `sectionOrder` hardcoded, usar type-based filtering para schema ✅

### 7.3 Publications

- [x] **4.3.1** `papers.bib` — mantenido en inglés (publicaciones académicas, no se traducen) ✅
- [x] **4.3.2** `coauthors.yaml` — mantenido (nombres propios) ✅
- [x] **4.3.3** `getPublications(locale)` usa `t("pages.publications.*")` para group titles ✅

---

## 8. Fase 5 — Content Collections (MDX)

> **Objetivo**: Estructurar posts y tools para contenido bilingüe.

### 8.1 Estrategia de organización

**Opción elegida**: Carpetas por locale dentro de cada collection.

```plaintext
src/content/posts/
├── en/
│   ├── 001-secure-nginx-client-certificates.mdx
│   ├── 002-serve-virtual-files-nginx.mdx
│   └── ...
└── es/
    ├── 001-secure-nginx-client-certificates.mdx
    └── ...
```

### 8.2 Posts

- [x] **5.1.1** Añadir campo `lang` al schema de posts en `content.config.ts`
- [x] **5.1.2** Mover posts existentes a `posts/en/`
- [x] **5.1.3** Actualizar `generateId` para incluir/excluir prefijo de locale
- [x] **5.1.4** Actualizar queries de posts en todas las páginas para filtrar por `lang`
- [x] **5.1.5** Crear al menos 1 post de prueba en `posts/es/` para validar ✅ (`999-testing-components.mdx` draft)
- [x] **5.1.6** Actualizar `getUniqueTags()` para filtrar por locale
- [x] **5.1.7** Actualizar template `_template.mdx` para incluir campo `lang`
- [x] **5.1.8** ~~Decidir: ¿traducir los 8 posts existentes?~~ ✅ Traducidos los 8 posts (001-008) al español — incluido en Fase 7

### 8.3 Tools MDX

- [x] **5.2.1** Añadir campo `lang` al schema de tools en `content.config.ts`
- [x] **5.2.2** Mover tools MDX a `tools/en/`
- [x] **5.2.3** Actualizar `generateId` para tools
- [x] **5.2.4** Actualizar `componentMap` en `tools/[...slug].astro`
- [x] **5.2.5** Actualizar queries de tools para filtrar por `lang`
- [x] **5.2.6** Crear al menos 1 tool MDX de prueba en `tools/es/` ✅ (`hash-calculator.mdx`)

### 8.4 Contenido a traducir

| Contenido    | Palabras aprox. | Fase   | Estado |
| ------------ | --------------- | ------ | ------ |
| 8 blog posts | ~35,000         | Fase 7 | ✅     |
| 14 tools MDX | ~3,000          | Fase 7 | ✅     |
| CV completo  | ~2,000          | Fase 4 | ✅     |

> **Nota (D5)**: ✅ Los 8 posts y 14 tools MDX han sido traducidos al español. Contenido futuro sin traducir usará fallback a EN con banner (D2).

### 8.5 Fallback de contenido (D2 — detalle de implementación)

Cuando una página ES no tiene contenido traducido:

1. **Query**: Buscar contenido con `lang: locale`, si no existe, buscar con `lang: "en"`
2. **Banner**: Mostrar aviso visible: `"Este contenido aún no está disponible en español. Mostrando la versión en inglés."`
3. **Atributo `lang`**: Envolver el contenido fallback en `<article lang="en">` para que los lectores de pantalla pronuncien correctamente en inglés
4. **Canonical**: El canonical de la página fallback debe apuntar a la versión EN original
5. **hreflang**: NO generar hreflang ES para páginas que son 100% fallback (no hay contenido ES real)

```astro
---
// Ejemplo de patrón fallback en [slug].astro
const locale = Astro.currentLocale as Locale;
let post = await getEntry("posts", `${locale}/${slug}`);
const isFallback = !post;
if (!post) {
  post = await getEntry("posts", `en/${slug}`);
}
---

{isFallback && <FallbackBanner locale={locale} />}
<article lang={isFallback ? "en" : locale}>
  <Content />
</article>
```

---

## 9. Fase 6 — Preact Islands (Homelab)

> **Objetivo**: i18n para componentes interactivos TSX del homelab.

### Reto específico

Los Preact islands se hidratan en el cliente. Necesitan las traducciones disponibles en runtime.

### Estrategia

1. Pasar traducciones como props desde el componente Astro padre
2. O inyectar un `<script>` con las traducciones como JSON serializadas
3. O crear un hook `useTranslation(locale)` para Preact

**Recomendada**: Props desde Astro — las islas son pocos componentes y el padre sabe el locale.

### Checklist

- [x] **6.1** `InfrastructureInsights.tsx`: ✅ Completado
  - [x] Extraer ~37 strings a interfaz `InfrastructureTranslations`
  - [x] Aceptar prop `translations` (serializado desde Astro en build time)
  - [x] Traducir: status labels, section headers, error messages, units
  - [x] URLs de blog posts locale-aware via `translatePath()`
  - [x] `StatusKey` interno (lowercase) + `getStatusLabel()` para display traducido
- [x] **6.2** `ServiceStats.tsx`: ✅ Completado
  - [x] Extraer ~11 strings a interfaz `ServiceStatsTranslations`
  - [x] Aceptar prop `translations` (serializado desde Astro en build time)
  - [x] Traducir: status labels, service names, link texts, aria-labels
- [x] **6.3** `ServiceCard.astro`: ✅ Completado
  - [x] aria-label usa `t("pages.homelab.opensInNewTab")`
- [x] **6.4** `HomelabPage.astro` pasa translations a islands: ✅ Completado
  - [x] Construye `infrastructureTranslations` y `serviceStatsTranslations` con `t()`
  - [x] Blog URLs generadas con `translatePath()` para locale-awareness

---

## 10. Fase 7 — Tools Interactivos (Apps)

> **Objetivo**: i18n para los 14 componentes interactivos en `src/components/apps/`.
>
> **⚠️ Esta es la fase más compleja y puede ejecutarse de forma incremental.**

### Reto específico

- Cada tool usa `<script is:inline>` con manipulación DOM directa
- No hay framework reactivo — los strings están embebidos en JS
- `CSPBuilder.astro` tiene 2213 líneas con cientos de strings
- Los strings están en HTML (labels, placeholders) Y en JS (mensajes dinámicos, validación)

### Estrategia propuesta

1. **Extraer strings de HTML** a la parte Astro (frontmatter + template) — usar `t()`
2. **Inyectar strings de JS** mediante `data-i18n-*` attributes o un objeto `window.__i18n__`
3. **Crear archivo de traducciones específico** por tool (o agrupados)

### Checklist por Tool

Para cada uno de los 14 tools (`base64-encoder`, `cert-inspector`, `color-contrast-checker`, `cron-builder`, `csp-builder`, `hash-calculator`, `http-headers-analyzer`, `modbus-frame-builder`, `nginx-config-generator`, `password-generator`, `regex-tester`, `subnet-calculator`, `timestamp-converter`, `wireguard-config-generator`):

- [x] **7.X.1** Auditar y listar todos los strings en HTML template
- [x] **7.X.2** Auditar y listar todos los strings en `<script is:inline>`
- [x] **7.X.3** Extraer strings HTML a `t(locale, ...)`
- [x] **7.X.4** Inyectar strings JS vía `define:vars` con objeto `i18n`
- [x] **7.X.5** Crear traducciones en `translations/en/tools.ts` y `es/tools.ts`
- [x] **7.X.6** Probar la tool en ambos idiomas ✅ Cubierto por tests E2E vía sitemap (incluye `/es/tools/*`)

### Prioridad sugerida por tool

| Prioridad | Tool                         | ~Strings | Complejidad  |
| --------- | ---------------------------- | -------- | ------------ |
| Alta      | `password-generator`         | ~20      | Baja         |
| Alta      | `hash-calculator`            | ~25      | Baja         |
| Alta      | `base64-encoder`             | ~15      | Baja         |
| Alta      | `timestamp-converter`        | ~20      | Baja         |
| Media     | `subnet-calculator`          | ~30      | Media        |
| Media     | `regex-tester`               | ~25      | Media        |
| Media     | `color-contrast-checker`     | ~30      | Media        |
| Media     | `cron-builder`               | ~35      | Media        |
| Baja      | `cert-inspector`             | ~35      | Media        |
| Baja      | `http-headers-analyzer`      | ~40      | Media        |
| Baja      | `modbus-frame-builder`       | ~40      | Alta         |
| Baja      | `nginx-config-generator`     | ~50      | Alta         |
| Baja      | `wireguard-config-generator` | ~40      | Alta         |
| Baja      | `csp-builder`                | ~100+    | **Muy alta** |

---

## 11. Fase 8 — SEO, RSS y PWA

> **Objetivo**: Que los metadatos, feeds y manifests soporten ambos idiomas.

### Requisitos SEO (según documentación oficial de Google)

1. **hreflang bidireccional**: Cada página EN debe enlazar a ES y viceversa. Si falta una dirección, Google puede ignorar ambas.
2. **URLs absolutas**: `hreflang` debe usar URLs absolutas con protocolo (`https://jmrp.io/...`).
3. **`x-default`**: Apunta a la versión por defecto (EN). Indica a Google qué mostrar cuando ningún hreflang coincide con el idioma del usuario.
4. **Auto-referencia**: Cada página debe incluir un hreflang que apunte a sí misma.
5. **Canonical por locale**: Cada versión traducida tiene su propio canonical (`/es/blog/post/` → canonical `/es/blog/post/`, NO cross-locale).
6. **Formato de código**: ISO 639-1 para idioma (`en`, `es`), opcionalmente ISO 3166-1 Alpha 2 para región (`en-US`, `es-ES`).

### Checklist

- [x] **8.1** `src/components/layout/BaseHead.astro` — SEO:
  - [x] `<link rel="alternate" hreflang="en" href="https://jmrp.io/...">` (URL absoluta)
  - [x] `<link rel="alternate" hreflang="es" href="https://jmrp.io/es/...">` (URL absoluta)
  - [x] `<link rel="alternate" hreflang="x-default" href="https://jmrp.io/...">` → siempre EN
  - [x] Asegurar bidireccionalidad: EN→ES y ES→EN en cada página
  - [x] Auto-referencia: cada página se incluye a sí misma en hreflang
  - [x] `<link rel="canonical">` por locale (NO cross-locale canonical)
  - [x] `og:locale` → `"en_US"` o `"es_ES"` dinámico (formato con underscore, no guion)
  - [x] `og:locale:alternate` → el otro locale
  - [x] `<html lang>` dinámico (ya cubierto en Fase 1)
  - [x] `<link rel="alternate" type="application/rss+xml">` para ambos feeds (EN y ES)
  - [x] `<link rel="manifest">` dinámico por locale
- [x] **8.2** JSON-LD `@graph`:
  - [x] `WebSite` `@id` y `inLanguage` → dinámico
  - [x] `BreadcrumbList` → labels traducidos
  - [x] `BlogPosting` → `inLanguage` por post + `isPartOf` referencia a WebSite
  - [x] `SoftwareApplication` → `inLanguage`
  - [x] Añadir `isPartOf` con referencia al `WebSite` `@id` correcto
  - [x] `inLanguage` añadido a los 11 componentes de página (BlogPost, ToolLayout, ToolCategoryPage, GitHubPage, CVPage, PublicationsPage, ToolsIndex, HomePage, BlogTagPage, BlogIndex, HomelabPage)
- [x] **8.3** RSS — feeds por locale:
  - [x] `src/pages/rss.xml.ts` → filtrar solo posts EN, `<language>en-us</language>`
  - [x] `src/pages/es/rss.xml.ts` → filtrar solo posts ES, `<language>es-es</language>`
  - [x] `"Continue reading on jmrp.io →"` → traducir en cada versión
  - [x] Copyright → traducir
  - [x] `<link rel="alternate" type="application/rss+xml">` para ambos feeds en `BaseHead.astro`
  - [x] Título del feed traducido: `"JMRP Blog RSS Feed"` / `"RSS del Blog JMRP"`
  - [x] Extraída lógica compartida a `src/utils/rss.ts` con `generateRssFeed(site, locale)`
- [x] **8.4** `src/pages/site.webmanifest.ts`:
  - [x] `lang: "en-US"` / `"es-ES"` → dinámico via `localeConfig[locale].bcp47`
  - [x] `short_name`, `name`, `description` → traducir
  - [x] `shortcuts[].name` y `.description` → traducir
  - [x] Generado un manifest por locale: `/site.webmanifest` (EN) + `/es/site.webmanifest` (ES)
  - [x] Extraída lógica compartida a `src/utils/manifest.ts` con `generateManifest(locale)`
- [x] **8.5** Sitemap:
  - [x] Verificar que `@astrojs/sitemap` genera `<xhtml:link rel="alternate">` para cada locale
  - [x] Cada `<url>` debe tener alternates para TODOS los locales incluyendo auto-referencia
  - [x] Confirmar que las URLs `/es/` aparecen en el sitemap con `lastmod`
- [x] **8.6** `robots.txt`:
  - [x] Añadir `Sitemap: .../sitemap-index.xml` (ya estaba)
  - [x] No bloquear `/es/` (ya correcto)
- [x] **8.7** `llms.txt` / `llms-full.txt`:
  - [x] Mencionar soporte bilingüe
  - [x] Añadir URLs de ambos RSS feeds

---

## 12. Fase 9 — Tests y QA

> **Objetivo**: Verificar que el sitio bilingüe funciona correctamente.
> **Estado**: ✅ Completado  
> **Commit**: (pendiente)

### Checklist

- [x] **9.1** Actualizar `accessibility.spec.ts`:
  - [x] Testear páginas `/es/` con axe-core — auto-cubierto por iteración sitemap
  - [x] Verificar `<html lang="es">` en páginas españolas — en `i18n.spec.ts`
  - [x] Verificar contraste en textos traducidos — auto-cubierto por axe-core
- [x] **9.2** Actualizar `deep.accessibility.spec.ts`:
  - [x] Verificar heading hierarchy en español — auto-cubierto por iteración sitemap
  - [x] Verificar keyboard nav en LanguageSwitcher — en `i18n.spec.ts`
- [x] **9.3** Actualizar `keyboard.accessibility.spec.ts`:
  - [x] Testear LanguageSwitcher con keyboard — auto-cubierto
  - [x] Verificar skip link traducido — auto-cubierto
- [x] **9.4** Actualizar `functional.spec.ts`:
  - [x] Auto-cubierto por iteración sitemap (`getCachedPages()` incluye `/es/`)
- [x] **9.5** Actualizar `integration.spec.ts`:
  - [x] Navegar entre idiomas — 3 nuevos tests añadidos
  - [x] Verificar que links internos usan el prefijo correcto
- [x] **9.6** Actualizar `security.spec.ts`:
  - [x] Verificar CSP/SRI en páginas `/es/` — auto-cubierto por iteración sitemap
- [x] **9.7** Actualizar `seo.spec.ts`:
  - [x] Verificar hreflang tags — en `i18n.spec.ts`
  - [x] Verificar `og:locale` y `og:locale:alternate` — en `i18n.spec.ts`
  - [x] Verificar JSON-LD `inLanguage` — en `i18n.spec.ts`
  - [x] Verificar sitemap incluye URLs `/es/` — en `i18n.spec.ts`
  - [x] Test RSS ES feed — nuevo test en `seo.spec.ts`
- [x] **9.8** Actualizar `performance.spec.ts`:
  - [x] Split RSS test en EN/ES separados
  - [x] Verificar lazy loading en páginas `/es/` — auto-cubierto
- [x] **9.9** Actualizar `icons.spec.ts`:
  - [x] Verificar consistencia de iconos en páginas `/es/` — auto-cubierto
- [x] **9.10** Crear nuevo `i18n.spec.ts` (159 tests):
  - [x] Test: `<html lang>` correcto por locale (iteración todas las páginas)
  - [x] Test: hreflang bidireccional (todos EN + todos ES)
  - [x] Test: LanguageSwitcher funciona (EN→ES, ES→EN)
  - [x] Test: URLs sin locale → inglés
  - [x] Test: URLs con `/es/` → español
  - [x] Test: 404 detecta locale (EN via preview, ES via fichero HTML estático)
  - [x] Test: RSS feed tiene locale correcto (EN + ES)
  - [x] Test: Sitemap incluye alternates
  - [x] Test: og:locale y og:locale:alternate
  - [x] Test: JSON-LD inLanguage (homepage EN/ES + blog post EN)
  - [x] Test: Web Manifest por locale (start_url, lang)
  - [x] Test: Canonical URLs por locale
- [x] **9.11** Actualizar `global-setup.ts`:
  - [x] No requiere cambios — el sitemap ya incluye páginas `/es/`
- [x] **9.12** Actualizar filters en tests para incluir páginas `/es/`:
  - [x] No requiere cambios — `getCachedPages()` auto-incluye desde sitemap

### Bugs encontrados y corregidos

1. **`<script>` sin escapar en traducciones (security bug)**: `howItWorksText` en `en/tools.ts` y `es/tools.ts` contenía `<script>` literal. Al renderizarse con `set:html`, se convertía en un script tag real causando `SyntaxError: Unexpected token ')'` en todas las páginas de blog.
2. **Icono `i-tabler:language` sin CSS**: El paquete `@iconify-json/tabler` no estaba instalado. Añadido como dependencia + icono al safelist de UnoCSS.
3. **Descripciones ES demasiado largas**: 4 descripciones en español superaban 160 caracteres (honeypot:162, tarpit:163, publications:164, tools:166).
4. **Título ES demasiado largo**: Honeypot ES tenía 75 chars (> 70 máx).
5. **Selector de test incorrecto**: `article a[href*='/blog/']` capturaba links de tags en vez del post link. Corregido a `article a.main-link`.

---

## 13. Fase 10 — Documentación y CI

> **Objetivo**: Actualizar toda la documentación y CI para reflejar el soporte bilingüe.

### Checklist

- [x] **10.1** Actualizar `CLAUDE.md` ✅
  - [x] Documentar arquitectura i18n
  - [x] Documentar patrón `t()` y estructura de traducciones
  - [x] Actualizar tabla de rutas con rutas `/es/`
  - [x] Documentar LanguageSwitcher
- [x] **10.2** Actualizar `README.md` ✅
  - [x] Mencionar soporte bilingüe
- [x] **10.3** Actualizar `CONTRIBUTING.md` ✅
  - [x] Guía para añadir traducciones
  - [x] Guía para crear contenido en español
- [x] **10.4** Crear `docs/I18N_GUIDE.md` ✅ (487 líneas)
  - [x] Cómo añadir un nuevo string traducible
  - [x] Cómo crear un post en español
  - [x] Cómo traducir un tool
  - [x] Cómo añadir un tercer idioma (futuro)
- [x] **10.5** Actualizar `.github/copilot-instructions.md` ✅
  - [x] Añadir convenciones de i18n
  - [x] Patrón de uso de `t()`
- [x] **10.6** Actualizar `.github/instructions/` ✅
  - [x] `blog-content.instructions.md` → mencionar `lang` en frontmatter
  - [x] `tools.instructions.md` → mencionar `lang`
  - [x] `astro-components.instructions.md` → patrón `Astro.currentLocale`
- [x] **10.7** Actualizar CI ✅
  - [x] `ci.yml` — builds incluyen `/es/` automáticamente (Astro i18n)
  - [x] Scripts de validación — RSS valida ambos feeds (EN + ES), Lychee escanea `dist/**/*.html`
  - [x] Schema validation — cubierto por Playwright tests (`inLanguage` en JSON-LD)
- [x] **10.8** Actualizar `src/components/ui/AGENTS.md` y `src/components/apps/AGENTS.md` ✅
- [x] **10.9** Actualizar `docs/BLOG_POST_GUIDE.md` ✅
  - [x] Instrucciones para posts bilingües

---

## 14. Inventario Completo de Strings

### 14.1 Translations Key Map (propuesta)

```typescript
// common.ts
{
  "skipToContent": "Skip to content",
  "allRightsReserved": "All rights reserved.",
  "tableOfContents": "Table of Contents",
  "home": "Home",
  "blog": "Blog",
  "tools": "Tools",
  "cv": "CV",
  "publications": "Publications",
  "repositories": "Repositories",
  "homelab": "Homelab",
  "readMore": "Read more",
  "backTo": "← Back to {page}",
  "viewAll": "View all {items} →",
  "loading": "Loading...",
  "error": "An error occurred",
  "noResults": "No results found.",
  "search": "Search",
  "close": "Close",
  "open": "Open",
  "language": "Language",
  "english": "English",
  "spanish": "Español",
}

// aria.ts
{
  "mainNav": "Main Navigation",
  "homeLogo": "Home - JMRP",
  "toggleNav": "Toggle Navigation",
  "toggleTheme": "Toggle theme",
  "switchToDark": "Switch to dark theme",
  "switchToLight": "Switch to light theme",
  "breadcrumb": "Breadcrumb",
  "tableOfContents": "Table of Contents",
  "tocDrawer": "Table of Contents Drawer",
  "close": "Close",
  "copyToClipboard": "Copy to clipboard",
  "copied": "Copied!",
  "visitProfile": "Visit my {name} profile",
  "viewTaggedPosts": "View all posts tagged with {tag}",
  "readArticle": "Read article: {title}",
  "opensNewTab": "{text} (opens in new tab)",
  "showTab": "Show {label} tab",
  "calloutType": "{type} callout",
  "stepByStep": "Step-by-step guide",
  "checklist": "Checklist",
  "codeContent": "Code content for {filename}",
  "comparison": "Comparison: {before} vs {after}",
  "mdnDocs": "MDN documentation for {name}",
  "searchRepos": "Search repositories",
  "viewRepo": "View repository {name} on GitHub",
  "authRequired": "Authentication required",
  "playSoundNedry": "Play Nedry sound",
}

// pages.ts
{
  "home": {
    "viewCV": "View CV",
    "readBlog": "Read Blog",
    "projects": "Projects",
    "homelab": "Homelab",
    "latestBlog": "Latest from the Blog",
    "viewAllPosts": "View all posts →",
    "featuredProjects": "Featured Projects",
    "viewAllRepos": "View all repositories →",
  },
  "blog": {
    "title": "Blog",
    "subtitle": "Thoughts, tutorials, and engineering notes.",
    "disclaimer": "Real projects, AI-assisted drafting...",
    "backToBlog": "← Back to Blog",
    "readArticle": "Read article →",
    "articlesAbout": "{count} {articles} about {tag}",
    "article": "article",
    "articles": "articles",
    "post": "post",
    "posts": "posts",
    "aboutThisTopic": "about this topic",
    "backToAllPosts": "← Back to all posts",
    "topics": "Topics",
  },
  // ... etc para cada página
}

// seo.ts
{
  "rssFeedTitle": "JMRP Blog RSS Feed",
  "rssContinueReading": "Continue reading on jmrp.io →",
  "rssCopyright": "Copyright {year} {author}. All rights reserved.",
  // ... meta descriptions por página
}

// components.ts
{
  "details": "Details",
  "prerequisites": "Prerequisites",
  "browserSupport": "Browser Support",
  "fullSupport": "Full Support",
  "partialSupport": "Partial Support",
  "noSupport": "No Support",
  "unknown": "Unknown",
  "references": "Further Reading & Resources",
  "deprecated": "Deprecated",
  "isDeprecated": "is deprecated",
  "willBeRemovedIn": "and will be removed in",
  "useInstead": "Use instead:",
  "mandatory": "Mandatory",
  "experimental": "Experimental",
  "preview": "Preview",
  "breakingChange": "Breaking Change",
  "security": "Security",
  "level": "Level",
  "noDescription": "No description provided.",
  "star": "star",
  "stars": "stars",
  "fork": "fork",
  "forks": "forks",
  "findRepo": "Find a repository...",
  "noReposFound": "No repositories found.",
  "cvNavigation": "CV Navigation",
  "openCVMenu": "Open CV Menu",
  "closeCVMenu": "Close Menu",
  "downloadCertificate": "Download certificate: {name}",
  "certificate": "Certificate",
  "skillLevels": {
    "none": "None",
    "elementary": "Elementary",
    "basic": "Basic",
    "intermediate": "Intermediate",
    "advanced": "Advanced",
    "expert": "Expert",
    "unknown": "Unknown",
  },
  "abstract": "Abstract",
  "bibtex": "BibTeX",
  "pdf": "PDF",
  "doi": "DOI",
  "url": "URL",
  "slides": "Slides",
  "poster": "Poster",
  "na": "N/A",
}
```

---

## 15. Decisiones de Diseño

### 15.1 Confirmadas

| #   | Decisión                           | Razón                                  |
| --- | ---------------------------------- | -------------------------------------- |
| 1   | **Prefix-based routing** (`/es/`)  | Estándar SEO, Astro nativo             |
| 2   | **Inglés sin prefijo**             | Es el default, URLs limpias            |
| 3   | **TypeScript para traducciones**   | Type-safety, autocompletado            |
| 4   | **`Astro.currentLocale`**          | API nativa Astro 6, menos boilerplate  |
| 5   | **Carpetas por locale en content** | Claridad, permite contenido parcial    |
| 6   | **Props para Preact i18n**         | Mínimo overhead, build-time resolution |

### 15.2 Decisiones Resueltas

| #   | Decisión                | **Resolución**                    | Razón                                                                                                                                           |
| --- | ----------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Páginas `/es/`          | **Wrapper**                       | Páginas mínimas en `src/pages/es/` que importan componente compartido con `locale` prop. Menos duplicación, fácil de mantener.                  |
| D2  | Contenido parcial en ES | **Fallback a EN con banner**      | Si un post/tool no tiene versión ES, se muestra la versión EN con banner "Este contenido aún no está disponible en español". Siempre accesible. |
| D3  | Tools interactivos      | **Traducir todo**                 | Traducir las 14 tools como parte del plan completo. Es la fase más compleja pero se busca cobertura total.                                      |
| D4  | URL slugs               | **Mantener en inglés**            | Mismo slug en ambos idiomas (`/es/blog/secure-nginx/`). Más simple, no rompe links, facilita mapeo entre versiones.                             |
| D5  | Blog posts              | **Traducir todos**                | Crear versiones ES de los 8 posts existentes. Esfuerzo considerable (~15.000 palabras) pero se busca cobertura completa.                        |
| D6  | Detección de idioma     | **Client-side detect + redirect** | Script client-side que detecta `navigator.language` y redirige en primera visita si el usuario no ha elegido manualmente.                       |
| D7  | Página 404              | **Un 404 por locale**             | `src/pages/es/404.astro` (wrapper). Más limpio, cada locale tiene su propia página de error traducida.                                          |
| D8  | Site config             | **YAML separados por locale**     | `site.yaml` (compartido) + `site.en.yaml` + `site.es.yaml`. Claro y explícito, requiere actualizar schema en `content.config.ts`.               |

---

## 16. Riesgos y Mitigaciones

| Riesgo                                       | Impacto | Probabilidad | Mitigación                                             |
| -------------------------------------------- | ------- | ------------ | ------------------------------------------------------ |
| Tools `<script is:inline>` difíciles de i18n | Alto    | Alta         | Inyectar strings vía `data-*`, no reescribir JS        |
| Content collections break al reorganizar     | Alto    | Media        | Hacer en rama separada, tests antes/después            |
| Performance: doble build (2x páginas)        | Medio   | Media        | Astro SSG maneja bien, monitorizar build time          |
| SEO: Google indexa contenido duplicado       | Alto    | Baja         | hreflang correcto, canonical tags                      |
| Strings sin traducir en producción           | Medio   | Media        | Test de regression: buscar strings EN en páginas ES    |
| `Astro.currentLocale` no disponible en beta  | Medio   | Baja         | Fallback a `getLangFromUrl(Astro.url)`                 |
| Mermaid SVGs con texto embebido              | Bajo    | Media        | Los diagramas se adaptan en el MDX traducido           |
| Formularios en tools no accesibles en ES     | Medio   | Media        | Auditoría axe-core por tool                            |
| Build time aumenta significativamente        | Medio   | Media        | Caché de imágenes optimizadas, builds incrementales    |
| Tests lentos con doble de páginas            | Bajo    | Alta         | Filtrar por locale o paralelizar                       |
| View Transitions + cambio de idioma          | Medio   | Media        | Verificar `<html lang>` en `astro:before-swap` handler |
| Nginx 404 no configurado por locale          | Medio   | Baja         | Actualizar post-build integration para generar config  |

---

## Orden de Ejecución Recomendado

```
Fase 0 (Infraestructura)      ██████████  Semana 1     ✅
Fase 1 (Layouts/Nav)          ██████████  Semana 1-2   ✅
Fase 8 (SEO/RSS/PWA)          ████░░░░░░  Semana 2
Fase 2 (Páginas, sin content) ██████████  Semana 2-3   ✅
Fase 3 (Componentes UI)       ██████████  Semana 3     ✅
Fase 4 (YAML content)         ██████████  Semana 3-4   ✅
Fase 5 (Content Collections)  ██████████  Semana 4     ✅
Fase 6 (Preact Islands)       ██████████  Semana 4-5   ✅
Fase 7 (Tools Apps)           ████████████ Semana 5-7
Fase 9 (Tests)                ████████░░  Semana 7-8
Fase 10 (Docs/CI)             ████░░░░░░  Semana 8
--- Cobertura completa ---
```

### Cobertura Completa

Todas las fases (0-10) = sitio completamente bilingüe:

- ✅ Selector de idioma + detección automática (client-side)
- ✅ Layouts y navegación traducidos
- ✅ Todas las páginas con UI en español
- ✅ SEO correcto (hreflang, og:locale, JSON-LD)
- ✅ CV en español
- ✅ RSS en español
- ✅ 8 blog posts traducidos al español
- ✅ 14 tools interactivos traducidos
- ✅ Homelab islands traducidos
- ✅ Tests cubriendo ambos idiomas
- ✅ Fallback a EN con banner para contenido futuro sin traducir

---

## 17. Consideraciones Nuevas (Post-Investigación)

> Puntos descubiertos durante la investigación de docs oficiales, plugins y mejores prácticas.

### 17.1 Nginx — Configuración 404 por locale

El servidor Nginx necesita servir la página 404 correcta según el locale:

```nginx
# /es/ → página 404 en español
location /es/ {
    error_page 404 /es/404/index.html;
}

# Default → página 404 en inglés
error_page 404 /404/index.html;
```

**Impacto**: Requiere actualizar el post-build que genera `security_headers.conf` y/o la config de Nginx.

### 17.2 View Transitions y locale

El sitio usa Astro View Transitions (`astro:before-swap`, `astro:after-swap`). Al cambiar de idioma:

1. El `<html lang="...">` debe actualizarse correctamente durante la transición
2. El script de detección de idioma (0.10) NO debe redirigir durante una View Transition
3. El tema (dark/light) persiste en `localStorage` por dominio — sin impacto entre locales ✅
4. El `LanguageSwitcher` debería funcionar con View Transitions sin recarga completa

**Acción**: Verificar en Phase 1 que `astro:before-swap` handler actualiza `<html lang>`.

### 17.3 Atributo `lang` en contenido fallback

Cuando se muestra contenido EN en una página ES (fallback por D2):

- Envolver en `<article lang="en">` para que los lectores de pantalla cambien de voz
- Importante para WCAG 3.1.2 (Language of Parts, nivel AA)
- El banner de fallback SÍ debe estar en español (es UI, no contenido)

### 17.4 Cross-locale links visibles

Cada post/tool debería tener un enlace visible a su versión en el otro idioma:

```html
<!-- En versión EN -->
<a
  href="/es/blog/post/"
  hreflang="es"
  lang="es"
  >Leer en español</a
>

<!-- En versión ES -->
<a
  href="/blog/post/"
  hreflang="en"
  lang="en"
  >Read in English</a
>
```

Esto complementa el LanguageSwitcher del header y mejora la descubribilidad.

### 17.5 Estimación de impacto en build time

| Concepto          | Actual  | Con i18n | Impacto |
| ----------------- | ------- | -------- | ------- |
| Páginas estáticas | ~13     | ~26      | ×2      |
| Blog posts        | 8       | 16       | ×2      |
| Tool pages        | 14      | 28       | ×2      |
| Category pages    | ~5      | ~10      | ×2      |
| Tag pages         | ~8      | ~16      | ×2      |
| **Total páginas** | **~48** | **~96**  | **×2**  |

Astro SSG maneja cientos de páginas sin problemas. El impacto esperado es mínimo (~+30-60s en build).

### 17.6 Uso de `Intl` API

Preferir la API `Intl` nativa de JavaScript sobre implementaciones manuales:

| API                       | Uso                 | Ejemplo                                                                                       |
| ------------------------- | ------------------- | --------------------------------------------------------------------------------------------- |
| `Intl.DateTimeFormat`     | Formateo de fechas  | `new Intl.DateTimeFormat("es", { dateStyle: "long" }).format(date)` → "17 de febrero de 2026" |
| `Intl.NumberFormat`       | Formateo de números | `new Intl.NumberFormat("es").format(1234)` → "1.234"                                          |
| `Intl.PluralRules`        | Pluralización       | `new Intl.PluralRules("es").select(1)` → "one", `select(2)` → "other"                         |
| `Intl.RelativeTimeFormat` | Tiempo relativo     | `new Intl.RelativeTimeFormat("es").format(-2, "day")` → "hace 2 días"                         |

**Ventaja**: Sin dependencias extras, soporte nativo en Node 22+, locale-aware.

### 17.7 Content Collections — `generateId` con locales

Al mover contenido a carpetas por locale (`posts/en/`, `posts/es/`), el `generateId` puede incluir el prefijo de locale. Para evitar problemas con los slugs:

```typescript
// content.config.ts — opción posible
const posts = defineCollection({
  // ...
  generateId: ({ entry }) => {
    // entry: "en/001-post-slug.mdx" → id: "en/001-post-slug"
    return entry.replace(/\.mdx?$/, "");
  },
});
```

La query luego filtra por prefix: `posts.filter(p => p.id.startsWith("en/"))` o mejor, por campo `lang` del frontmatter.

### 17.8 Compatibilidad con `Astro.preferredLocale`

- `Astro.preferredLocale` = **SSR-only** (requiere `Accept-Language` header del request)
- `Astro.currentLocale` = **SSG + SSR** (derivado de la URL, siempre disponible)
- En SSG, la detección de idioma del navegador SOLO se puede hacer client-side con `navigator.language`

**Conclusión**: Usar siempre `Astro.currentLocale` en componentes. La detección automática es un script client-side separado (0.10).

### 17.9 Web Manifest por locale

Evaluar si generar `/es/site.webmanifest` separado o mantener uno único. Si el manifest tiene `name` y `description` traducidos, conviene uno por locale. El `<link rel="manifest">` en `BaseHead.astro` apuntaría al manifest del locale actual.

### 17.10 Mermaid diagrams

Los diagramas Mermaid se renderizan como SVG en build time con texto embebido. Opciones:

1. **Dejar en inglés** — Los textos técnicos (flowcharts, secuencias) suelen ser más claros en inglés
2. **Duplicar en MDX** — Crear versión ES del bloque Mermaid en el post traducido
3. **Recomendado**: Opción 2 para posts traducidos (el traductor adapta el diagrama en el MDX ES)

---

> **Siguiente paso**: Comenzar con la **Fase 0 — Infraestructura Base**.
