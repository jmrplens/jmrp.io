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

| Categoría | ~Strings únicos | Complejidad |
|-----------|----------------|-------------|
| Infraestructura i18n | — | Media |
| Layouts y navegación | ~15 | Baja |
| Páginas (UI text) | ~80 | Media |
| Páginas (metadata/SEO) | ~40 | Media |
| Componentes UI | ~50 | Baja |
| ARIA/Accesibilidad | ~60 | Media |
| Preact Islands (Homelab) | ~70 | Alta |
| Contenido site_config | ~30 | Baja |
| CV YAML | ~200+ | Alta |
| Publications utils | ~4 | Baja |
| 14 Tools (apps) | ~500+ | **Muy alta** |
| 8 Blog posts MDX | Miles de palabras | **Altísima** |
| 14 Tools MDX docs | Cientos de palabras | Alta |
| RSS/PWA/manifest | ~10 | Baja |
| Tests | ~20 | Media |

### Rutas resultantes

| Inglés (default) | Español |
|-------------------|---------|
| `/` | `/es/` |
| `/blog/` | `/es/blog/` |
| `/blog/[slug]/` | `/es/blog/[slug]/` |
| `/blog/tags/[tag]/` | `/es/blog/tags/[tag]/` |
| `/cv/` | `/es/cv/` |
| `/github/` | `/es/github/` |
| `/homelab/` | `/es/homelab/` |
| `/publications/` | `/es/publications/` |
| `/tools/` | `/es/tools/` |
| `/tools/[slug]/` | `/es/tools/[slug]/` |
| `/tools/categories/[cat]/` | `/es/tools/categories/[cat]/` |
| `/404` | `/es/404` |
| `/rss.xml` | `/es/rss.xml` |

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
export function useTranslatedPath(lang: Locale): (path: string, l?: Locale) => string;

// Helpers adicionales
export function getAlternateUrls(path: string): { locale: Locale; url: string }[];
export function formatDate(date: Date, locale: Locale): string;  // Intl.DateTimeFormat
export function formatNumber(num: number, locale: Locale): string;  // Intl.NumberFormat
export function pluralize(count: number, singular: string, plural: string, locale: Locale): string;  // Intl.PluralRules
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

- [ ] **0.1** Crear directorio `src/i18n/` con estructura base
- [ ] **0.2** Crear `src/i18n/config.ts`:
  - [ ] Definir tipo `Locale = "en" | "es"`
  - [ ] Definir `defaultLocale`, `locales`, `localeLabels`
  - [ ] Definir tipo `LocaleConfig` con nombre del idioma, dirección, date locale
- [ ] **0.3** Crear `src/i18n/utils.ts` (basado en el recipe oficial de Astro):
  - [ ] Implementar `getLangFromUrl(url: URL): Locale` — extrae locale de la URL
  - [ ] Implementar `useTranslations(lang: Locale)` — retorna función `t(key)` type-safe
  - [ ] Implementar `useTranslatedPath(lang: Locale)` — retorna función para generar paths localizados
  - [ ] Implementar `getAlternateUrls(path: string): { locale: Locale; url: string }[]` — para hreflang
  - [ ] Implementar `formatDate(date, locale): string` — usar `Intl.DateTimeFormat` (no `toLocaleDateString`)
  - [ ] Implementar `formatNumber(num, locale): string` — usar `Intl.NumberFormat`
  - [ ] Implementar `pluralize(count, key, locale): string` — usar `Intl.PluralRules` (ES tiene reglas different a EN)
- [ ] **0.4** Crear `src/i18n/translations/en/common.ts` — primer archivo con las keys básicas
- [ ] **0.5** Crear `src/i18n/translations/es/common.ts` — traducción española
- [ ] **0.6** Crear `src/i18n/translations/index.ts` — barrel export con types
- [ ] **0.7** Añadir path alias `@i18n` en `tsconfig.json`
- [ ] **0.8** Actualizar `astro.config.mjs`:
  - [ ] Configurar `i18n.routing`: `{ prefixDefaultLocale: false }`
  - [ ] NO usar `i18n.fallback` (conflictos con páginas ES existentes — fallback a nivel de contenido)
  - [ ] Verificar `@astrojs/sitemap` i18n config (ya configurado parcialmente en L131-134)
  - [ ] Verificar compatibilidad con Astro 6 beta
- [ ] **0.9** Crear componente `LanguageSwitcher.astro`:
  - [ ] Botón/dropdown para cambiar idioma
  - [ ] Preservar la ruta actual al cambiar idioma
  - [ ] Accesible (ARIA, keyboard nav)
  - [ ] Integrar en Header
- [ ] **0.10** Crear script de detección automática de idioma (client-side):
  - [ ] Detectar `navigator.language` / `navigator.languages`
  - [ ] Redirigir a `/es/` en primera visita si idioma del navegador es `es*`
  - [ ] Respetar elección manual del usuario (guardar en `localStorage`)
  - [ ] No redirigir si el usuario ya está en la versión correcta
  - [ ] Inyectar en `BaseLayout.astro` (solo se ejecuta una vez)
- [ ] **0.11** Crear helper para páginas: patrón de wrapper page
  ```astro
  ---
  // src/pages/es/index.astro — wrapper que importa componente compartido
  ---
  ```
- [ ] **0.12** Documentar el patrón de uso para desarrolladores
- [ ] **0.13** Crear test unitario para `t()`, `getLocale()`, `getLocalizedUrl()`

### Decisiones resueltas en Fase 0

- **D0.1** → **Wrapper pages**: Páginas mínimas en `/es/` que importan componente compartido con `locale` prop
- **D0.2** → **TypeScript** (`.ts`): con `as const satisfies` para type-safety, permite comentarios e interpolación
- **D0.3** → **Nested** con punto-notation flatten para la función `t()`: `{ nav: { home: "..." } }` → `t(locale, "nav.home")`

---

## 4. Fase 1 — Layouts y Navegación

> **Objetivo**: Hacer que layouts y navegación soporten ambos idiomas.

### Checklist

- [ ] **1.1** `src/layouts/BaseLayout.astro`:
  - [ ] `<html lang="en">` → `<html lang={locale}>` dinámico
  - [ ] `"Skip to content"` → `t(locale, "common.skipToContent")`
  - [ ] Pasar `locale` como prop o derivarla de `Astro.url`
  - [ ] Añadir `<link rel="alternate" hreflang="en" href="...">` y `hreflang="es"`
  - [ ] Añadir `hreflang="x-default"` apuntando a inglés
- [ ] **1.2** `src/layouts/ToolLayout.astro`:
  - [ ] `"Tools"` breadcrumb → `t(locale, "nav.tools")`
  - [ ] `aria-label="Breadcrumb"` → `t(locale, "aria.breadcrumb")`
  - [ ] `"Web Browser"`, `"USD"` en JSON-LD — evaluar si traducir
- [ ] **1.3** `src/components/layout/BaseHead.astro`:
  - [ ] `"JMRP"` suffix → mantener (nombre propio)
  - [ ] `"Home"` breadcrumb JSON-LD → `t(locale, "nav.home")`
  - [ ] `"JMRP Blog RSS Feed"` → `t(locale, "seo.rssFeedTitle")`
  - [ ] `hreflang` alternate links en `<head>`
  - [ ] `og:locale` y `og:locale:alternate`
- [ ] **1.4** `src/components/layout/Header.astro`:
  - [ ] `aria-label="Main Navigation"` → `t(locale, "aria.mainNav")`
  - [ ] `aria-label="Home - JMRP"` → `t(locale, "aria.homeLogo")`
  - [ ] `aria-label="Toggle Navigation"` → `t(locale, "aria.toggleNav")`
  - [ ] Nav labels dinámicas desde site_config traducido
  - [ ] Integrar `LanguageSwitcher` en el header
  - [ ] Mobile menu: también incluir language switcher
- [ ] **1.5** `src/components/layout/Footer.astro`:
  - [ ] `"All rights reserved."` → `t(locale, "common.allRightsReserved")`
  - [ ] `` `Visit my ${link.label} profile` `` → `t(locale, "aria.visitProfile", { name: link.label })`
- [ ] **1.6** `src/components/layout/TableOfContentsDrawer.astro`:
  - [ ] `"Table of Contents"` (h2) → `t(locale, "common.tableOfContents")`
  - [ ] `aria-label="Table of Contents"` → `t(locale, "aria.tableOfContents")`
  - [ ] `aria-label="Close"` → `t(locale, "aria.close")`
  - [ ] `aria-label="Table of Contents Drawer"` → `t(locale, "aria.tocDrawer")`

### Archivos afectados

| Archivo | Strings a traducir |
|---------|-------------------|
| `src/layouts/BaseLayout.astro` | 2 |
| `src/layouts/ToolLayout.astro` | 3 |
| `src/components/layout/BaseHead.astro` | 3+ meta tags |
| `src/components/layout/Header.astro` | 3 ARIA + nav labels |
| `src/components/layout/Footer.astro` | 2 |
| `src/components/layout/TableOfContentsDrawer.astro` | 4 |

---

## 5. Fase 2 — Páginas Principales

> **Objetivo**: Traducir todas las páginas y crear las versiones `/es/`.

### 5.1 Homepage (`index.astro`)

- [ ] **2.1.1** `"View CV"` → `t(locale, "pages.home.viewCV")`
- [ ] **2.1.2** `"Read Blog"` → `t(locale, "pages.home.readBlog")`
- [ ] **2.1.3** `"Projects"` → `t(locale, "pages.home.projects")`
- [ ] **2.1.4** `"Homelab"` → `t(locale, "pages.home.homelab")`
- [ ] **2.1.5** `"Latest from the Blog"` → `t(locale, "pages.home.latestBlog")`
- [ ] **2.1.6** `"View all posts →"` → `t(locale, "pages.home.viewAllPosts")`
- [ ] **2.1.7** `"Featured Projects"` → `t(locale, "pages.home.featuredProjects")`
- [ ] **2.1.8** `"View all repositories →"` → `t(locale, "pages.home.viewAllRepos")`
- [ ] **2.1.9** Todos los `aria-label` de los CTAs
- [ ] **2.1.10** Hero content: cargarlo desde site_config traducido
- [ ] **2.1.11** Crear `src/pages/es/index.astro`

### 5.2 Blog Index (`blog/index.astro`)

- [ ] **2.2.1** `"Blog"` (h1) → `t(locale, "pages.blog.title")`
- [ ] **2.2.2** `"Thoughts, tutorials, and engineering notes."` → subtitle
- [ ] **2.2.3** Disclaimer de AI → `t(locale, "pages.blog.disclaimer")`
- [ ] **2.2.4** JSON-LD metadata
- [ ] **2.2.5** Meta description
- [ ] **2.2.6** Filtrar posts por locale
- [ ] **2.2.7** Crear `src/pages/es/blog/index.astro`

### 5.3 Blog Post (`blog/[...slug].astro`)

- [ ] **2.3.1** `"← Back to Blog"` → `t(locale, "pages.blog.backToBlog")`
- [ ] **2.3.2** `toLocaleDateString("en-US", ...)` → `formatDate(date, locale)`
- [ ] **2.3.3** `aria-label` de tags → `t(locale, "aria.viewTaggedPosts", { tag })`
- [ ] **2.3.4** `"Read article →"` → `t(locale, "pages.blog.readArticle")`
- [ ] **2.3.5** Resolver posts por locale en `getStaticPaths`
- [ ] **2.3.6** Crear `src/pages/es/blog/[...slug].astro`

### 5.4 Blog Tags (`blog/tags/[tag].astro`)

- [ ] **2.4.1** `` `${count} articles about ${tag}` `` → pluralización traducida
- [ ] **2.4.2** `"article"/"articles"` y `"post"/"posts"` → pluralización
- [ ] **2.4.3** `"← Back to all posts"` → traducir
- [ ] **2.4.4** Crear `src/pages/es/blog/tags/[tag].astro`

### 5.5 CV (`cv.astro`)

- [ ] **2.5.1** `"Curriculum Vitae"` (h1) → mantener o traducir a "Currículum Vítae"
- [ ] **2.5.2** Section titles: `"General Information"`, `"Experience"`, etc.
- [ ] **2.5.3** Meta description
- [ ] **2.5.4** JSON-LD schema
- [ ] **2.5.5** Cargar `cv/en.yaml` o `cv/es.yaml` según locale
- [ ] **2.5.6** Crear `src/pages/es/cv.astro`

### 5.6 GitHub (`github.astro`)

- [ ] **2.6.1** `"GitHub Repositories"` — título y h1
- [ ] **2.6.2** `"Open Source Enthusiast"` — fallback bio
- [ ] **2.6.3** `"Repositories"`, `"Followers"`, `"Following"` — stats labels
- [ ] **2.6.4** Meta description y JSON-LD
- [ ] **2.6.5** Crear `src/pages/es/github.astro`

### 5.7 Homelab (`homelab.astro`)

- [ ] **2.7.1** `"Homelab Status"` — h1
- [ ] **2.7.2** Párrafo introductorio
- [ ] **2.7.3** Service descriptions (Mastodon, Matrix, Meshtastic)
- [ ] **2.7.4** `"User:"` label
- [ ] **2.7.5** `"Node: NGINX Edge Security & Analytics"` — h2
- [ ] **2.7.6** Link texts: `"Visit mstdn.jmrp.io"`, `"Chat on Matrix"`, `"Open Mesh Hub"`
- [ ] **2.7.7** Meta description
- [ ] **2.7.8** Crear `src/pages/es/homelab.astro`

### 5.8 Publications (`publications.astro`)

- [ ] **2.8.1** `"Publications"` — título y h1
- [ ] **2.8.2** Meta description y JSON-LD
- [ ] **2.8.3** Publication group titles en `utils/publications.ts`:
  - `"Journal articles"` → `"Artículos de revista"`
  - `"Conference and workshop papers"` → `"Artículos de conferencia y talleres"`
  - `"Thesis"` → `"Tesis"`
  - `"Other"` → `"Otros"`
- [ ] **2.8.4** Crear `src/pages/es/publications.astro`

### 5.9 Tools Index (`tools/index.astro`)

- [ ] **2.9.1** `"Developer Tools"` — h1
- [ ] **2.9.2** Intro text
- [ ] **2.9.3** Category names: `"Security Tools"`, `"Developer Tools"`, `"Network & Server Tools"`, `"Embedded & Industrial Tools"`, `"MikroTik Tools"`
- [ ] **2.9.4** Meta description y JSON-LD
- [ ] **2.9.5** Crear `src/pages/es/tools/index.astro`

### 5.10 Tools Categories (`tools/categories/[category].astro`)

- [ ] **2.10.1** Category names y descriptions
- [ ] **2.10.2** `"Tools"` breadcrumb
- [ ] **2.10.3** `"tool"/"tools"` pluralización
- [ ] **2.10.4** `"← Back to all tools"` → traducir
- [ ] **2.10.5** Crear `src/pages/es/tools/categories/[category].astro`

### 5.11 Tool Detail (`tools/[...slug].astro`)

- [ ] **2.11.1** Resolver tools por locale en `getStaticPaths`
- [ ] **2.11.2** Breadcrumb labels
- [ ] **2.11.3** Crear `src/pages/es/tools/[...slug].astro`

### 5.12 404 (`404.astro`) — Un 404 por locale (D7)

- [ ] **2.12.1** `"404: Ah ah ah!"` — título (¿mantener en inglés por ser referencia cultural?)
- [ ] **2.12.2** `"Page Not Found"` → `"Página No Encontrada"`
- [ ] **2.12.3** `"You didn't say the magic word"` → traducir
- [ ] **2.12.4** `"← Go Home"` → `"← Ir al Inicio"`
- [ ] **2.12.5** Crear `src/pages/es/404.astro` (wrapper, cada locale tiene su 404)

---

## 6. Fase 3 — Componentes UI

> **Objetivo**: Traducir todos los labels, ARIA y defaults de los 35 componentes UI.

### Checklist

- [ ] **3.1** `ThemeToggle.astro`:
  - [ ] `aria-label="Toggle theme"` → `t(locale, "aria.toggleTheme")`
  - [ ] JS dynamic: `"Switch to dark/light theme"` → inyectar traducciones vía `data-*` attrs
- [ ] **3.2** `CopyButton.astro`:
  - [ ] `"Copy to clipboard"` → `t(locale, "components.copyToClipboard")`
  - [ ] `"Copied!"` (JS feedback) → inyectar vía `data-copied-text`
- [ ] **3.3** `Callout.astro`:
  - [ ] `` `${type} callout` `` → `t(locale, "aria.calloutType", { type })`
  - [ ] `` `${type}:` `` → screen reader prefix traducido
- [ ] **3.4** `TLDRSummary.astro`:
  - [ ] `title = "TL;DR"` — mantener (acrónimo universal) o añadir `"Resumen"` para ES
- [ ] **3.5** `Collapsible.astro`:
  - [ ] `"Details"` default → `t(locale, "components.details")`
- [ ] **3.6** `StepByStep.astro`:
  - [ ] `aria-label="Step-by-step guide"` → `t(locale, "aria.stepByStep")`
- [ ] **3.7** `CheckList.astro`:
  - [ ] `aria-label="Checklist"` → `t(locale, "aria.checklist")`
- [ ] **3.8** `Prerequisite.astro`:
  - [ ] `title = "Prerequisites"` → `t(locale, "components.prerequisites")`
- [ ] **3.9** `BrowserSupport.astro`:
  - [ ] `"Browser Support"` → `t(locale, "components.browserSupport")`
  - [ ] `"Full Support"`, `"Partial Support"`, `"No Support"`, `"Unknown"` → traducir
- [ ] **3.10** `References.astro`:
  - [ ] `"Further Reading & Resources"` → `t(locale, "components.references")`
- [ ] **3.11** `DeprecatedNotice.astro`:
  - [ ] `"Deprecated"`, `"is deprecated"`, `"and will be removed in"`, `"Use instead:"` → traducir
- [ ] **3.12** `StateNotice.astro`:
  - [ ] Labels: `"Deprecated"`, `"Mandatory"`, `"Experimental"`, `"Preview"`, `"Breaking Change"`, `"Security"` → traducir
- [ ] **3.13** `VersionBadge.astro`:
  - [ ] `prefix: "Level"` → `t(locale, "components.level")`
- [ ] **3.14** `Tabs.astro`:
  - [ ] `` `Show ${label} tab` `` → `t(locale, "aria.showTab", { label })`
- [ ] **3.15** `APIEndpoint.astro`:
  - [ ] `aria-label="Authentication required"` → traducir
- [ ] **3.16** `FileContent.astro`:
  - [ ] `` `Code content for ${filename}` `` → `t(locale, "aria.codeContent", { filename })`
- [ ] **3.17** `BeforeAfter.astro`:
  - [ ] `` `Comparison: ${before} vs ${after}` `` → traducir template
- [ ] **3.18** `DirectiveCard.astro`:
  - [ ] `` `MDN documentation for ${name}` `` → traducir template

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

- [ ] **4.1.1** Separar `site.yaml` en datos compartidos + datos traducibles:
  - **Compartido** (no traducible): `url`, `theme_color`, `background_color`, `social_links`, `fediverse_creator`, `twitter_creator`, `logo_text`, `featured_projects`
  - **Traducible**: `title`, `description`, `keywords`, `locale`, `nav[].label`, `hero.*`, `shortcuts[].name`, `shortcuts[].description`, `person.jobTitle`
- [ ] **4.1.2** Crear `site.en.yaml` con strings en inglés
- [ ] **4.1.3** Crear `site.es.yaml` con strings en español
- [ ] **4.1.4** Actualizar `content.config.ts` para soportar site config por locale
- [ ] **4.1.5** Actualizar helpers que leen site config para aceptar `locale`

### 7.2 CV

- [ ] **4.2.1** Renombrar `main.yaml` → `en.yaml` (o crear `en/main.yaml`)
- [ ] **4.2.2** Crear `es.yaml` con CV en español:
  - [ ] Section titles traducidos
  - [ ] Experience descriptions traducidas
  - [ ] Skill levels (los numéricos pueden mantenerse, solo labels)
  - [ ] Certificate names (algunos en inglés original)
  - [ ] Map items: `"Full Name"`, `"Languages"`, etc.
- [ ] **4.2.3** Actualizar `getCVData()` en `utils/cv.ts` para aceptar locale
- [ ] **4.2.4** Actualizar `content.config.ts` schema si cambia la estructura

### 7.3 Publications

- [ ] **4.3.1** `papers.bib` — mantener en inglés (son publicaciones académicas, no se traducen)
- [ ] **4.3.2** `coauthors.yaml` — mantener (nombres propios)
- [ ] **4.3.3** Group titles en `utils/publications.ts` → usar `t(locale, ...)`

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

- [ ] **5.1.1** Añadir campo `lang` al schema de posts en `content.config.ts`
- [ ] **5.1.2** Mover posts existentes a `posts/en/`
- [ ] **5.1.3** Actualizar `generateId` para incluir/excluir prefijo de locale
- [ ] **5.1.4** Actualizar queries de posts en todas las páginas para filtrar por `lang`
- [ ] **5.1.5** Crear al menos 1 post de prueba en `posts/es/` para validar
- [ ] **5.1.6** Actualizar `getUniqueTags()` para filtrar por locale
- [ ] **5.1.7** Actualizar template `_template.mdx` para incluir campo `lang`
- [ ] **5.1.8** Decidir: ¿traducir los 8 posts existentes? (P6 — futuro)

### 8.3 Tools MDX

- [ ] **5.2.1** Añadir campo `lang` al schema de tools en `content.config.ts`
- [ ] **5.2.2** Mover tools MDX a `tools/en/`
- [ ] **5.2.3** Actualizar `generateId` para tools
- [ ] **5.2.4** Actualizar `componentMap` en `tools/[...slug].astro`
- [ ] **5.2.5** Actualizar queries de tools para filtrar por `lang`
- [ ] **5.2.6** Crear al menos 1 tool MDX de prueba en `tools/es/`

### 8.4 Contenido a traducir

| Contenido | Palabras aprox. | Fase |
|-----------|----------------|------|
| 8 blog posts | ~15,000+ | Fase 5 |
| 14 tools MDX | ~3,000 | Fase 5 |
| CV completo | ~2,000 | Fase 4 |

> **Nota (D5)**: Se traducirán los 8 posts existentes al español. Contenido futuro sin traducir usará fallback a EN con banner (D2).

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

- [ ] **6.1** `InfrastructureInsights.tsx`:
  - [ ] Extraer ~40 strings a un objeto de traducciones
  - [ ] Aceptar prop `locale` o `translations`
  - [ ] Traducir: status labels, section headers, error messages, units
- [ ] **6.2** `ServiceStats.tsx`:
  - [ ] Extraer ~30 strings
  - [ ] Aceptar prop `locale` o `translations`
  - [ ] Traducir: status labels, service names, link texts
- [ ] **6.3** `ServiceCard.astro`:
  - [ ] `` `${linkText} (opens in new tab)` `` → `t(locale, "aria.opensNewTab", { text })`
- [ ] **6.4** Actualizar `homelab.astro` para pasar locale a islands

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

- [ ] **7.X.1** Auditar y listar todos los strings en HTML template
- [ ] **7.X.2** Auditar y listar todos los strings en `<script is:inline>`
- [ ] **7.X.3** Extraer strings HTML a `t(locale, ...)`
- [ ] **7.X.4** Inyectar strings JS vía `data-*` o JSON global
- [ ] **7.X.5** Crear traducciones en `translations/en/tools.ts` y `es/tools.ts`
- [ ] **7.X.6** Probar la tool en ambos idiomas

### Prioridad sugerida por tool

| Prioridad | Tool | ~Strings | Complejidad |
|-----------|------|----------|-------------|
| Alta | `password-generator` | ~20 | Baja |
| Alta | `hash-calculator` | ~25 | Baja |
| Alta | `base64-encoder` | ~15 | Baja |
| Alta | `timestamp-converter` | ~20 | Baja |
| Media | `subnet-calculator` | ~30 | Media |
| Media | `regex-tester` | ~25 | Media |
| Media | `color-contrast-checker` | ~30 | Media |
| Media | `cron-builder` | ~35 | Media |
| Baja | `cert-inspector` | ~35 | Media |
| Baja | `http-headers-analyzer` | ~40 | Media |
| Baja | `modbus-frame-builder` | ~40 | Alta |
| Baja | `nginx-config-generator` | ~50 | Alta |
| Baja | `wireguard-config-generator` | ~40 | Alta |
| Baja | `csp-builder` | ~100+ | **Muy alta** |

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

- [ ] **8.1** `src/components/layout/BaseHead.astro` — SEO:
  - [ ] `<link rel="alternate" hreflang="en" href="https://jmrp.io/...">` (URL absoluta)
  - [ ] `<link rel="alternate" hreflang="es" href="https://jmrp.io/es/...">` (URL absoluta)
  - [ ] `<link rel="alternate" hreflang="x-default" href="https://jmrp.io/...">` → siempre EN
  - [ ] Asegurar bidireccionalidad: EN→ES y ES→EN en cada página
  - [ ] Auto-referencia: cada página se incluye a sí misma en hreflang
  - [ ] `<link rel="canonical">` por locale (NO cross-locale canonical)
  - [ ] `og:locale` → `"en_US"` o `"es_ES"` dinámico (formato con underscore, no guion)
  - [ ] `og:locale:alternate` → el otro locale
  - [ ] `<html lang>` dinámico (ya cubierto en Fase 1)
- [ ] **8.2** JSON-LD `@graph`:
  - [ ] `WebSite` `@id` y `inLanguage` → dinámico
  - [ ] `BreadcrumbList` → labels traducidos
  - [ ] `BlogPosting` → `inLanguage` por post
  - [ ] `SoftwareApplication` → `inLanguage`
  - [ ] Añadir `isPartOf` con referencia al `WebSite` `@id` correcto
- [ ] **8.3** RSS — feeds por locale:
  - [ ] `src/pages/rss.xml.ts` → filtrar solo posts EN, `<language>en-us</language>`
  - [ ] `src/pages/es/rss.xml.ts` → filtrar solo posts ES, `<language>es-es</language>`
  - [ ] `"Continue reading on jmrp.io →"` → traducir en cada versión
  - [ ] Copyright → traducir
  - [ ] `<link rel="alternate" type="application/rss+xml">` para ambos feeds en `BaseHead.astro`
  - [ ] Título del feed traducido: `"JMRP Blog RSS Feed"` / `"JMRP Blog - Feed RSS"`
- [ ] **8.4** `src/pages/site.webmanifest.ts`:
  - [ ] `lang: "en-US"` → dinámico
  - [ ] `short_name`, `name`, `description` → traducir
  - [ ] `shortcuts[].name` y `.description` → traducir
  - [ ] Evaluar si generar un manifest por locale o mantener uno único
- [ ] **8.5** Sitemap:
  - [ ] Verificar que `@astrojs/sitemap` genera `<xhtml:link rel="alternate">` para cada locale
  - [ ] Cada `<url>` debe tener alternates para TODOS los locales incluyendo auto-referencia
  - [ ] Confirmar que las URLs `/es/` aparecen en el sitemap con `lastmod`
- [ ] **8.6** `robots.txt`:
  - [ ] Añadir `Sitemap: .../sitemap-index.xml` (ya debería estar)
  - [ ] No bloquear `/es/`
- [ ] **8.7** `llms.txt` / `llms-full.txt`:
  - [ ] Mencionar soporte bilingüe
  - [ ] Evaluar si crear versión en español

---

## 12. Fase 9 — Tests y QA

> **Objetivo**: Verificar que el sitio bilingüe funciona correctamente.

### Checklist

- [ ] **9.1** Actualizar `accessibility.spec.ts`:
  - [ ] Testear páginas `/es/` con axe-core
  - [ ] Verificar `<html lang="es">` en páginas españolas
  - [ ] Verificar contraste en textos traducidos (pueden ser más largos)
- [ ] **9.2** Actualizar `deep.accessibility.spec.ts`:
  - [ ] Verificar heading hierarchy en español
  - [ ] Verificar keyboard nav en LanguageSwitcher
- [ ] **9.3** Actualizar `keyboard.accessibility.spec.ts`:
  - [ ] Testear LanguageSwitcher con keyboard
  - [ ] Verificar skip link traducido
- [ ] **9.4** Actualizar `functional.spec.ts`:
  - [ ] Testear cambio de idioma preserva ruta
  - [ ] Testear persistencia de tema entre idiomas
  - [ ] Testear mobile menu en `/es/`
- [ ] **9.5** Actualizar `integration.spec.ts`:
  - [ ] Navegar entre idiomas
  - [ ] Verificar que links internos usan el prefijo correcto
- [ ] **9.6** Actualizar `security.spec.ts`:
  - [ ] Verificar CSP/SRI en páginas `/es/`
- [ ] **9.7** Actualizar `seo.spec.ts`:
  - [ ] Verificar hreflang tags
  - [ ] Verificar `og:locale` y `og:locale:alternate`
  - [ ] Verificar JSON-LD `inLanguage`
  - [ ] Verificar sitemap incluye URLs `/es/`
- [ ] **9.8** Actualizar `performance.spec.ts`:
  - [ ] Verificar que no hay CLS extra por LanguageSwitcher
  - [ ] Verificar lazy loading en páginas `/es/`
- [ ] **9.9** Actualizar `icons.spec.ts`:
  - [ ] Verificar consistencia de iconos en páginas `/es/`
- [ ] **9.10** Crear nuevo `i18n.spec.ts`:
  - [ ] Test: `<html lang>` correcto por locale
  - [ ] Test: hreflang bidireccional
  - [ ] Test: LanguageSwitcher funciona
  - [ ] Test: URLs sin locale → inglés
  - [ ] Test: URLs con `/es/` → español
  - [ ] Test: 404 detecta locale
  - [ ] Test: RSS feed tiene locale correcto
  - [ ] Test: Sitemap incluye alternates
  - [ ] Test: Fechas formateadas según locale
  - [ ] Test: No hay strings sin traducir (regression)
- [ ] **9.11** Actualizar `global-setup.ts`:
  - [ ] Incluir páginas `/es/` en el cache
- [ ] **9.12** Actualizar filters en tests para incluir páginas `/es/`

---

## 13. Fase 10 — Documentación y CI

> **Objetivo**: Actualizar toda la documentación y CI para reflejar el soporte bilingüe.

### Checklist

- [ ] **10.1** Actualizar `CLAUDE.md`:
  - [ ] Documentar arquitectura i18n
  - [ ] Documentar patrón `t()` y estructura de traducciones
  - [ ] Actualizar tabla de rutas con rutas `/es/`
  - [ ] Documentar LanguageSwitcher
- [ ] **10.2** Actualizar `README.md`:
  - [ ] Mencionar soporte bilingüe
- [ ] **10.3** Actualizar `CONTRIBUTING.md`:
  - [ ] Guía para añadir traducciones
  - [ ] Guía para crear contenido en español
- [ ] **10.4** Crear `docs/I18N_GUIDE.md`:
  - [ ] Cómo añadir un nuevo string traducible
  - [ ] Cómo crear un post en español
  - [ ] Cómo traducir un tool
  - [ ] Cómo añadir un tercer idioma (futuro)
- [ ] **10.5** Actualizar `.github/copilot-instructions.md`:
  - [ ] Añadir convenciones de i18n
  - [ ] Patrón de uso de `t()`
- [ ] **10.6** Actualizar `.github/instructions/`:
  - [ ] `blog-content.instructions.md` → mencionar `lang` en frontmatter
  - [ ] `tools.instructions.md` → mencionar `lang`
  - [ ] `astro-components.instructions.md` → patrón `Astro.currentLocale`
- [ ] **10.7** Actualizar CI:
  - [ ] `ci.yml` — verificar que builds incluyen `/es/`
  - [ ] Scripts de validación — incluir páginas `/es/`
  - [ ] Schema validation — cubrir JSON-LD con `inLanguage`
- [ ] **10.8** Actualizar `src/components/ui/AGENTS.md` y `src/components/apps/AGENTS.md`
- [ ] **10.9** Actualizar `docs/BLOG_POST_GUIDE.md`:
  - [ ] Instrucciones para posts bilingües

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

| # | Decisión | Razón |
|---|----------|-------|
| 1 | **Prefix-based routing** (`/es/`) | Estándar SEO, Astro nativo |
| 2 | **Inglés sin prefijo** | Es el default, URLs limpias |
| 3 | **TypeScript para traducciones** | Type-safety, autocompletado |
| 4 | **`Astro.currentLocale`** | API nativa Astro 6, menos boilerplate |
| 5 | **Carpetas por locale en content** | Claridad, permite contenido parcial |
| 6 | **Props para Preact i18n** | Mínimo overhead, build-time resolution |

### 15.2 Decisiones Resueltas

| # | Decisión | **Resolución** | Razón |
|---|----------|----------------|-------|
| D1 | Páginas `/es/` | **Wrapper** | Páginas mínimas en `src/pages/es/` que importan componente compartido con `locale` prop. Menos duplicación, fácil de mantener. |
| D2 | Contenido parcial en ES | **Fallback a EN con banner** | Si un post/tool no tiene versión ES, se muestra la versión EN con banner "Este contenido aún no está disponible en español". Siempre accesible. |
| D3 | Tools interactivos | **Traducir todo** | Traducir las 14 tools como parte del plan completo. Es la fase más compleja pero se busca cobertura total. |
| D4 | URL slugs | **Mantener en inglés** | Mismo slug en ambos idiomas (`/es/blog/secure-nginx/`). Más simple, no rompe links, facilita mapeo entre versiones. |
| D5 | Blog posts | **Traducir todos** | Crear versiones ES de los 8 posts existentes. Esfuerzo considerable (~15.000 palabras) pero se busca cobertura completa. |
| D6 | Detección de idioma | **Client-side detect + redirect** | Script client-side que detecta `navigator.language` y redirige en primera visita si el usuario no ha elegido manualmente. |
| D7 | Página 404 | **Un 404 por locale** | `src/pages/es/404.astro` (wrapper). Más limpio, cada locale tiene su propia página de error traducida. |
| D8 | Site config | **YAML separados por locale** | `site.yaml` (compartido) + `site.en.yaml` + `site.es.yaml`. Claro y explícito, requiere actualizar schema en `content.config.ts`. |

---

## 16. Riesgos y Mitigaciones

| Riesgo | Impacto | Probabilidad | Mitigación |
|--------|---------|--------------|------------|
| Tools `<script is:inline>` difíciles de i18n | Alto | Alta | Inyectar strings vía `data-*`, no reescribir JS |
| Content collections break al reorganizar | Alto | Media | Hacer en rama separada, tests antes/después |
| Performance: doble build (2x páginas) | Medio | Media | Astro SSG maneja bien, monitorizar build time |
| SEO: Google indexa contenido duplicado | Alto | Baja | hreflang correcto, canonical tags |
| Strings sin traducir en producción | Medio | Media | Test de regression: buscar strings EN en páginas ES |
| `Astro.currentLocale` no disponible en beta | Medio | Baja | Fallback a `getLangFromUrl(Astro.url)` |
| Mermaid SVGs con texto embebido | Bajo | Media | Los diagramas se adaptan en el MDX traducido |
| Formularios en tools no accesibles en ES | Medio | Media | Auditoría axe-core por tool |
| Build time aumenta significativamente | Medio | Media | Caché de imágenes optimizadas, builds incrementales |
| Tests lentos con doble de páginas | Bajo | Alta | Filtrar por locale o paralelizar |
| View Transitions + cambio de idioma | Medio | Media | Verificar `<html lang>` en `astro:before-swap` handler |
| Nginx 404 no configurado por locale | Medio | Baja | Actualizar post-build integration para generar config |

---

## Orden de Ejecución Recomendado

```
Fase 0 (Infraestructura)      ████████░░  Semana 1
Fase 1 (Layouts/Nav)          ██████░░░░  Semana 1-2
Fase 8 (SEO/RSS/PWA)          ████░░░░░░  Semana 2
Fase 2 (Páginas, sin content) ████████░░  Semana 2-3
Fase 3 (Componentes UI)       ██████░░░░  Semana 3
Fase 4 (YAML content)         ████░░░░░░  Semana 3-4
Fase 5 (Content Collections)  ██████░░░░  Semana 4
Fase 6 (Preact Islands)       ████░░░░░░  Semana 4-5
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
<a href="/es/blog/post/" hreflang="es" lang="es">Leer en español</a>

<!-- En versión ES -->
<a href="/blog/post/" hreflang="en" lang="en">Read in English</a>
```

Esto complementa el LanguageSwitcher del header y mejora la descubribilidad.

### 17.5 Estimación de impacto en build time

| Concepto | Actual | Con i18n | Impacto |
|----------|--------|----------|---------|
| Páginas estáticas | ~13 | ~26 | ×2 |
| Blog posts | 8 | 16 | ×2 |
| Tool pages | 14 | 28 | ×2 |
| Category pages | ~5 | ~10 | ×2 |
| Tag pages | ~8 | ~16 | ×2 |
| **Total páginas** | **~48** | **~96** | **×2** |

Astro SSG maneja cientos de páginas sin problemas. El impacto esperado es mínimo (~+30-60s en build).

### 17.6 Uso de `Intl` API

Preferir la API `Intl` nativa de JavaScript sobre implementaciones manuales:

| API | Uso | Ejemplo |
|-----|-----|---------|
| `Intl.DateTimeFormat` | Formateo de fechas | `new Intl.DateTimeFormat("es", { dateStyle: "long" }).format(date)` → "17 de febrero de 2026" |
| `Intl.NumberFormat` | Formateo de números | `new Intl.NumberFormat("es").format(1234)` → "1.234" |
| `Intl.PluralRules` | Pluralización | `new Intl.PluralRules("es").select(1)` → "one", `select(2)` → "other" |
| `Intl.RelativeTimeFormat` | Tiempo relativo | `new Intl.RelativeTimeFormat("es").format(-2, "day")` → "hace 2 días" |

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
