# Investigación i18n — Referencia Técnica

> **Propósito**: Documentar toda la investigación previa a la implementación i18n.  
> **Fecha**: 2026-02-17  
> **Contexto**: jmrp.io — Astro 6 SSG, EN (default) + ES

---

## 1. Astro 6 — API i18n Nativa

### 1.1 Configuración (`astro.config.mjs`)

```javascript
i18n: {
  defaultLocale: "en",
  locales: ["en", "es"],
  routing: {
    prefixDefaultLocale: false,       // EN sin prefijo, ES con /es/
    redirectToDefaultLocale: true,     // /en/ → / (redirección)
    fallbackType: "redirect",          // Páginas faltantes → redirect al fallback
  },
  fallback: {
    es: "en",  // Páginas ES sin crear → redirigen a EN
  },
}
```

#### Opciones de `routing`

| Opción | Tipo | Default | Descripción |
|--------|------|---------|-------------|
| `prefixDefaultLocale` | `boolean` | `false` | Si `true`, EN también usa `/en/` prefix |
| `redirectToDefaultLocale` | `boolean` | `true` | Redirige `/en/` → `/` cuando `prefixDefaultLocale: false` |
| `fallbackType` | `"redirect" \| "rewrite"` | `"redirect"` | `redirect`: 301 a la versión fallback. `rewrite`: genera HTML con contenido del fallback en la URL original |
| `"manual"` | (en lugar de objeto) | — | Desactiva middleware i18n de Astro, control total manual |

#### `fallbackType` detalle

- **`"redirect"`**: Si `/es/about/` no existe pero fallback `es → en`, genera una redirección 301 a `/about/`.
- **`"rewrite"`**: Genera `dist/es/about/index.html` con el contenido de `dist/about/index.html`. La URL no cambia, el usuario ve contenido EN en ruta ES.

**Para nuestro caso**: Usaremos `"redirect"` como default. El contenido parcial (posts/tools sin traducir) se maneja a nivel de content collection queries, no de routing.

### 1.2 Módulo `astro:i18n`

```typescript
import {
  getRelativeLocaleUrl,      // "/es/blog/"
  getAbsoluteLocaleUrl,      // "https://jmrp.io/es/blog/"
  getRelativeLocaleUrlList,  // ["/blog/", "/es/blog/"]
  getAbsoluteLocaleUrlList,  // ["https://jmrp.io/blog/", "https://jmrp.io/es/blog/"]
  getPathByLocale,           // Obtiene path por locale (para custom paths)
  getLocaleByPath,           // Obtiene locale de un path
  pathHasLocale,             // Verifica si un path tiene prefijo de locale
  normalizeTheLocale,        // Normaliza "EN" → "en", "en-US" → "en-us"
} from "astro:i18n";
```

#### Funciones clave para nuestro uso

```typescript
// Generar URLs localizadas
getRelativeLocaleUrl("es", "/blog/");     // → "/es/blog/"
getRelativeLocaleUrl("en", "/blog/");     // → "/blog/"

// Generar todas las alternativas (para hreflang)
getRelativeLocaleUrlList("/blog/");       // → ["/blog/", "/es/blog/"]
getAbsoluteLocaleUrlList("/blog/");       // → ["https://jmrp.io/blog/", "https://jmrp.io/es/blog/"]
```

### 1.3 Propiedades de `Astro` disponibles

| Propiedad | Tipo | Disponible en | Descripción |
|-----------|------|---------------|-------------|
| `Astro.currentLocale` | `string \| undefined` | SSG + SSR | Locale derivado de la URL actual |
| `Astro.preferredLocale` | `string \| undefined` | **Solo SSR** | Locale preferido del navegador (Accept-Language) |
| `Astro.preferredLocaleList` | `string[] \| undefined` | **Solo SSR** | Lista ordenada de locales preferidos |

> **⚠️ IMPORTANTE**: `Astro.preferredLocale` NO está disponible en SSG. La detección de idioma del navegador solo funciona en SSR. Confirma que la decisión D6 (client-side detect) es correcta.

### 1.4 Patrón de Recipe Oficial (Astro Docs)

Astro recomienda este patrón para i18n manual:

```typescript
// src/i18n/ui.ts
export const languages = {
  en: "English",
  es: "Español",
};
export const defaultLang = "en";

export const ui = {
  en: {
    "nav.home": "Home",
    "nav.about": "About",
  },
  es: {
    "nav.home": "Inicio",
    "nav.about": "Sobre mí",
  },
} as const;

// src/i18n/utils.ts
import { ui, defaultLang } from "./ui";

export function getLangFromUrl(url: URL) {
  const [, lang] = url.pathname.split("/");
  if (lang in ui) return lang as keyof typeof ui;
  return defaultLang;
}

export function useTranslations(lang: keyof typeof ui) {
  return function t(key: keyof (typeof ui)[typeof defaultLang]) {
    return ui[lang][key] || ui[defaultLang][key];
  };
}

export function useTranslatedPath(lang: keyof typeof ui) {
  return function translatePath(path: string, l: string = lang) {
    return l === defaultLang ? path : `/${l}${path}`;
  };
}
```

**Uso en componentes:**
```astro
---
import { getLangFromUrl, useTranslations } from "@i18n/utils";
const lang = getLangFromUrl(Astro.url);
const t = useTranslations(lang);
---
<a href="/">{t("nav.home")}</a>
```

### 1.5 Language Picker (Recipe)

```astro
---
import { languages } from "@i18n/ui";
---
<ul>
  {Object.entries(languages).map(([lang, label]) => (
    <li>
      <a href={`/${lang}/`}>{label}</a>
    </li>
  ))}
</ul>
```

### 1.6 Content Collections con i18n

Para contenido localizado en collections, Astro recomienda carpetas por locale:

```
src/content/posts/
├── en/
│   └── post-1.mdx
└── es/
    └── post-1.mdx
```

Con `getStaticPaths` para generar rutas:

```typescript
export async function getStaticPaths() {
  const pages = await getCollection("posts");
  const paths = pages.map((page) => {
    const [lang, ...slug] = page.id.split("/");
    return {
      params: { lang, slug: slug.join("/") || undefined },
      props: page,
    };
  });
  return paths;
}
```

---

## 2. Evaluación de Plugins/Librerías

### 2.1 astro-i18next

| Aspecto | Detalle |
|---------|---------|
| **Downloads** | ~2,400/semana (bajando) |
| **Última versión** | 1.0.0-beta.21 (hace 3 años) |
| **Estado** | 🚧 Beta permanente, **abandonado** |
| **Issues abiertas** | 70+ |
| **Compatibilidad Astro 6** | ❌ No verificada |
| **Características** | `t()` via i18next, Trans component, HeadHrefLangs, CLI generate, route translation |
| **Dependencias** | i18next, i18next-fs-backend, i18next-http-backend |

**Ventajas:**
- CLI `generate` crea páginas localizadas automáticamente
- Trans component para interpolación HTML
- HeadHrefLangs auto-genera `<link rel="alternate">`

**Desventajas críticas:**
- ❌ Abandonado (3 años sin updates)
- ❌ Aún en beta, puede tener breaking changes sin resolver
- ❌ No compatible confirmado con Astro 6
- ❌ Dependencia grande (i18next ecosystem)
- ❌ JSON files en `public/` — no type-safe

**Veredicto**: ❌ **NO USAR** — proyecto abandonado e incompatible.

### 2.2 Paraglide JS (inlang)

| Aspecto | Detalle |
|---------|---------|
| **Downloads** | Creciendo activamente |
| **Estado** | ✅ Activo, bien mantenido |
| **Compatibilidad Astro** | ✅ Plugin oficial para Astro |
| **SSG** | ❌ **No soportado out-of-the-box** |
| **SSR** | ✅ Requiere `output: "server"` + adapter |
| **Características** | Compiler-based, tree-shakable, type-safe, autocomplete |
| **Bundle size** | Hasta 70% menor que runtime libraries |

**Ventajas:**
- Excelente DX: funciones tipadas `m.greeting({ name: "World" })`
- Tree-shaking automático (solo strings usados llegan al bundle)
- VS Code extension (Sherlock) para edición inline
- Soporte multi-framework (React, Vue, Svelte, Astro)

**Desventajas críticas:**
- ❌ **Requiere SSR** — `output: "server"` con adapter
- ❌ Requiere middleware para detección de locale
- ❌ Docs explícitamente dicen: *"SSG is not yet supported out of the box"*
- El beneficio de tree-shaking es irrelevante en SSG (todo se resuelve en build)

**Veredicto**: ❌ **NO COMPATIBLE** — requiere SSR, jmrp.io es SSG puro.

### 2.3 Otras opciones evaluadas

| Plugin | Downloads | Estado | Problema |
|--------|-----------|--------|----------|
| astro-i18n-aut | 6.1K/sem | Activo | Menos features, comunidad pequeña |
| @astrolicious/i18n | 527/sem | Nuevo | Muy baja adopción, riesgo de abandono |
| astro-nanostores-i18n | 779/sem | Activo | Requiere nanostores, overhead innecesario |
| astro-loader-i18n | 628/sem | Activo | Solo loader, no solución completa |

### 2.4 Conclusión: Enfoque Manual

**Decisión final**: Implementación manual usando:

1. **Astro native i18n routing** (config `i18n` en `astro.config.mjs`)
2. **`astro:i18n` module** (`getRelativeLocaleUrl`, etc.)
3. **`Astro.currentLocale`** para obtener locale en componentes
4. **TypeScript translation files** con `as const satisfies` para type-safety
5. **Recipe pattern** (`useTranslations()`, `getLangFromUrl()`)

**Razones:**
- Zero dependencias externas
- Control total sobre la implementación
- Type-safety completa con TypeScript
- Compatible con SSG (build-time resolution)
- Alineado con principio "zero client-side JavaScript"
- Sin riesgo de abandono de terceros
- Patrón recomendado por documentación oficial de Astro

---

## 3. SEO — Mejores Prácticas para Sitios Multilingües

### 3.1 hreflang (Google Official)

#### Requisitos obligatorios

1. **Bidireccional**: Si página EN apunta a ES, página ES debe apuntar a EN
2. **Auto-referencia**: Cada página debe incluirse a sí misma en los hreflang
3. **URLs absolutas**: `https://jmrp.io/es/blog/`, no `/es/blog/`
4. **Códigos válidos**: ISO 639-1 para idioma, opcionalmente ISO 3166-1 Alpha 2 para región

#### Implementación

```html
<!-- En TODAS las páginas (EN y ES) -->
<link rel="alternate" hreflang="en" href="https://jmrp.io/blog/" />
<link rel="alternate" hreflang="es" href="https://jmrp.io/es/blog/" />
<link rel="alternate" hreflang="x-default" href="https://jmrp.io/blog/" />
```

- **`x-default`** → Apunta a la versión EN (default locale)
- Se recomienda usar en todas las páginas para usuarios sin idioma matching

#### Tres métodos (Google acepta cualquiera)

1. **HTML `<link>` tags** en `<head>` — ✅ Usaremos este
2. **HTTP headers** — Para archivos no-HTML (PDFs). No aplica.
3. **Sitemap** con `<xhtml:link>` — ✅ `@astrojs/sitemap` ya lo soporta

### 3.2 og:locale

```html
<!-- Página EN -->
<meta property="og:locale" content="en_US" />
<meta property="og:locale:alternate" content="es_ES" />

<!-- Página ES -->
<meta property="og:locale" content="es_ES" />
<meta property="og:locale:alternate" content="en_US" />
```

### 3.3 Canonical URLs

- Cada versión de idioma tiene su **propia canonical** (NO cross-locale)
- `/blog/post/` → canonical es `/blog/post/`
- `/es/blog/post/` → canonical es `/es/blog/post/`
- Google NO considera versiones en distintos idiomas como duplicados si hreflang es correcto

### 3.4 Sitemap con hreflang

`@astrojs/sitemap` ya tiene configuración i18n en el proyecto:

```javascript
sitemap({
  i18n: {
    defaultLocale: "en",
    locales: { en: "en-US", es: "es-ES" },
  },
})
```

Esto genera automáticamente:
```xml
<url>
  <loc>https://jmrp.io/blog/</loc>
  <xhtml:link rel="alternate" hreflang="en-US" href="https://jmrp.io/blog/" />
  <xhtml:link rel="alternate" hreflang="es-ES" href="https://jmrp.io/es/blog/" />
</url>
```

### 3.5 JSON-LD `inLanguage`

```json
{
  "@type": "BlogPosting",
  "inLanguage": "en",
  "translationOfWork": {
    "@type": "BlogPosting",
    "@id": "https://jmrp.io/es/blog/post/"
  }
}
```

### 3.6 RSS per locale

- `/rss.xml` → Solo posts EN, `<language>en-us</language>`
- `/es/rss.xml` → Solo posts ES, `<language>es-es</language>`
- Ambos feeds anunciados en `<head>` de todas las páginas

---

## 4. Consideraciones Técnicas Adicionales

### 4.1 `Intl` API para formateo

```typescript
// Fechas — usar Intl.DateTimeFormat
const formatDate = (date: Date, locale: "en" | "es") =>
  new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);

// Números — usar Intl.NumberFormat
const formatNumber = (num: number, locale: "en" | "es") =>
  new Intl.NumberFormat(locale === "en" ? "en-US" : "es-ES").format(num);

// Pluralización — usar Intl.PluralRules
const pluralize = (count: number, singular: string, plural: string, locale: "en" | "es") => {
  const rule = new Intl.PluralRules(locale).select(count);
  return rule === "one" ? singular : plural;
};
```

### 4.2 View Transitions y locale

- View Transitions preservan `localStorage` y DOM state
- Al navegar entre `/blog/` y `/es/blog/`, la transición es fluida
- El `<html lang>` cambia correctamente con cada navegación
- Theme toggle state se preserva (localStorage es por dominio)

### 4.3 Nginx — 404 por locale

Necesario en configuración Nginx:

```nginx
# 404 por locale
location /es/ {
    error_page 404 /es/404/index.html;
}
location / {
    error_page 404 /404/index.html;
}
```

### 4.4 `lang` attribute en contenido fallback

Cuando se muestra contenido EN como fallback en página ES:

```html
<html lang="es">
  <!-- Banner en español -->
  <div class="fallback-banner" lang="es">
    Este contenido aún no está disponible en español.
  </div>
  <!-- Contenido en inglés -->
  <article lang="en">
    <!-- English content here -->
  </article>
</html>
```

El atributo `lang="en"` en el `<article>` es **obligatorio** para accesibilidad — los lectores de pantalla necesitan saber el idioma del contenido.

### 4.5 Impact en build time

| Antes | Después | Diferencia |
|-------|---------|------------|
| ~13 páginas estáticas | ~26 páginas estáticas | 2x |
| 8 blog posts | 16 blog posts (8 EN + 8 ES) | 2x |
| 14 tools | 28 tools (14 EN + 14 ES ) | 2x |
| **~35 rutas totales** | **~70 rutas totales** | 2x |

Astro SSG maneja esto sin problemas. El build time debería aumentar ~30-50%, no 2x, porque:
- Las imágenes se procesan una sola vez (shared)
- Los assets CSS/JS se compilan una sola vez
- Solo duplica la generación de HTML

### 4.6 Alternativa para contenido cross-locale

Cada post debería tener un enlace visible a su versión alternativa:

```html
<!-- En post EN -->
<a href="/es/blog/post/" hreflang="es">Leer en español</a>

<!-- En post ES -->
<a href="/blog/post/" hreflang="en">Read in English</a>
```

Esto además del `<link rel="alternate">` en `<head>` (que es solo para motores de búsqueda).

---

## 5. Resumen de Decisiones Técnicas

| Aspecto | Decisión | Razón |
|---------|----------|-------|
| Framework i18n | Manual (Astro native + recipe) | SSG compatible, zero deps, type-safe |
| Translation format | TypeScript `.ts` con `as const` | Type-safety, autocompletado, interpolación |
| URL strategy | EN sin prefijo, ES con `/es/` | SEO estándar, Astro default |
| Locale detection | `Astro.currentLocale` (build) + `navigator.language` (client) | SSG limitation |
| Content fallback | Query-level con banner + `lang` attribute | Accesibilidad, UX clara |
| hreflang | `<link>` en `<head>` + Sitemap | Google recommended |
| Date/Number format | `Intl.DateTimeFormat` / `Intl.NumberFormat` | Estándar, locale-aware |
| URL generation | `getRelativeLocaleUrl()` de `astro:i18n` | Built-in, mantenido por Astro |
| 404 per locale | Nginx config + wrapper pages | SSG: server decide qué 404 servir |

---

> **Siguiente**: Aplicar estos hallazgos al plan (`docs/I18N_PLAN.md`).
