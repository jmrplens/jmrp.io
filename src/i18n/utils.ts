/**
 * Internationalization utility functions.
 *
 * Based on the official Astro i18n recipe pattern with type-safe
 * dot-notation key access and `Intl` API formatting.
 *
 * @see https://docs.astro.build/en/recipes/i18n/
 */
import { defaultLocale, type Locale, localeConfig, locales } from "./config";
import { type Translations, translations } from "./translations";

// ---------------------------------------------------------------------------
// Dot-notation key flattening
// ---------------------------------------------------------------------------

/**
 * Recursively flattens a nested object type into dot-notation string keys.
 *
 * @example
 * ```ts
 * type T = { nav: { home: string; blog: string } };
 * type Keys = FlattenKeys<T>; // "nav.home" | "nav.blog"
 * ```
 */
type FlattenKeys<T, Prefix extends string = ""> = T extends string
  ? Prefix
  : {
      [K in keyof T & string]: FlattenKeys<
        T[K],
        Prefix extends "" ? K : `${Prefix}.${K}`
      >;
    }[keyof T & string];

/** All valid translation key paths (derived from the EN source of truth). */
export type TranslationKey = FlattenKeys<Translations>;

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Extract the locale from a URL pathname.
 *
 * @param url - The current page URL.
 * @returns The detected locale, falling back to `defaultLocale`.
 */
export function getLangFromUrl(url: URL): Locale {
  const [, maybeLang] = url.pathname.split("/", 2);
  if (maybeLang && (locales as readonly string[]).includes(maybeLang)) {
    return maybeLang as Locale;
  }
  return defaultLocale;
}

/**
 * Resolve a dot-notation key against a nested object.
 *
 * @param obj - The translations object.
 * @param key - A dot-separated path (e.g. `"nav.home"`).
 * @returns The resolved string value, or the key itself if not found.
 */
function resolve(obj: Record<string, unknown>, key: string): string {
  const parts = key.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return key;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : key;
}

/**
 * Replace `{placeholder}` tokens in a translated string.
 *
 * @param text - The raw translation string with `{placeholders}`.
 * @param params - Key-value map of replacements.
 * @returns The interpolated string.
 */
function interpolate(
  text: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return text;
  return text.replaceAll(/\{(\w+)\}/g, (match, key: string) => {
    if (!(key in params)) return match;
    return String(params[key]);
  });
}

// ---------------------------------------------------------------------------
// Public API — translation
// ---------------------------------------------------------------------------

/**
 * Return a translation function `t(key, params?)` bound to the given locale.
 *
 * Follows the official Astro recipe pattern: call once in the frontmatter,
 * then use the returned function throughout the template.
 *
 * @param lang - The target locale.
 * @returns A bound translation function.
 *
 * @example
 * ```astro
 * ---
 * import { getLangFromUrl, useTranslations } from "@i18n/utils";
 * const lang = getLangFromUrl(Astro.url);
 * const t = useTranslations(lang);
 * ---
 * <nav aria-label={t("aria.mainNav")}>{t("nav.home")}</nav>
 * ```
 */
export function useTranslations(lang: Locale) {
  const table = translations[lang] as Record<string, unknown>;
  const fallback = translations[defaultLocale] as Record<string, unknown>;

  return function t(
    key: TranslationKey,
    params?: Record<string, string | number>,
  ): string {
    const raw = resolve(table, key) || resolve(fallback, key);
    return interpolate(raw, params);
  };
}

// ---------------------------------------------------------------------------
// Public API — path helpers
// ---------------------------------------------------------------------------

/**
 * Return a function that converts a path to its localised version.
 *
 * Uses Astro's routing convention:
 * - Default locale (`en`) → path unchanged (`/blog/`)
 * - Other locales → prefix added (`/es/blog/`)
 *
 * @param lang - The target locale.
 * @returns A function `(path, targetLocale?) => localisedPath`.
 */
export function useTranslatedPath(lang: Locale) {
  return function translatePath(path: string, targetLocale?: Locale): string {
    const locale = targetLocale ?? lang;
    const cleanPath = stripLocalePrefix(path);

    if (locale === defaultLocale) {
      return cleanPath;
    }
    return `/${locale}${cleanPath}`;
  };
}

/**
 * Remove any leading locale prefix from a pathname.
 *
 * @param path - E.g. `/es/blog/post/` → `/blog/post/`.
 * @returns The path without locale prefix.
 */
export function stripLocalePrefix(path: string): string {
  const segments = path.split("/");
  // segments[0] is always '' (leading slash)
  if (segments[1] && (locales as readonly string[]).includes(segments[1])) {
    return "/" + segments.slice(2).join("/") || "/";
  }
  return path;
}

/**
 * Generate `hreflang` alternate URLs for all supported locales.
 *
 * @param pathname - The current page pathname (e.g. `/blog/post/`).
 * @param siteUrl - The absolute site URL (e.g. `https://jmrp.io`).
 * @returns An array of `{ locale, hreflang, url }` objects including `x-default`.
 */
export function getAlternateLinks(
  pathname: string,
  siteUrl: string,
): { locale: Locale | "x-default"; hreflang: string; url: string }[] {
  const base = siteUrl.replace(/\/$/, "");
  const cleanPath = stripLocalePrefix(pathname);

  const links: {
    locale: Locale | "x-default";
    hreflang: string;
    url: string;
  }[] = [];

  for (const locale of locales) {
    const localePath =
      locale === defaultLocale ? cleanPath : `/${locale}${cleanPath}`;
    links.push({
      locale,
      hreflang: locale,
      url: `${base}${localePath}`,
    });
  }

  // x-default points to the default locale (EN without prefix)
  links.push({
    locale: "x-default",
    hreflang: "x-default",
    url: `${base}${cleanPath}`,
  });

  return links;
}

// ---------------------------------------------------------------------------
// Public API — formatting (Intl)
// ---------------------------------------------------------------------------

/**
 * Format a date according to the locale.
 *
 * @param date - The date to format.
 * @param locale - The target locale.
 * @param options - Optional `Intl.DateTimeFormat` options.
 * @returns The formatted date string.
 */
export function formatDate(
  date: Date,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions,
): string {
  const defaults: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  return new Intl.DateTimeFormat(
    localeConfig[locale].bcp47,
    options ?? defaults,
  ).format(date);
}

/**
 * Format a number according to the locale.
 *
 * @param num - The number to format.
 * @param locale - The target locale.
 * @param options - Optional `Intl.NumberFormat` options.
 * @returns The formatted number string.
 */
export function formatNumber(
  num: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(localeConfig[locale].bcp47, options).format(num);
}

/**
 * Select the correct plural form for a count.
 *
 * @param count - The numeric count.
 * @param forms - An object mapping `Intl.PluralRules` categories to strings.
 * @param locale - The target locale.
 * @returns The correct plural form string.
 *
 * @example
 * ```ts
 * pluralize(1, { one: "post", other: "posts" }, "en");  // "post"
 * pluralize(3, { one: "post", other: "posts" }, "en");  // "posts"
 * ```
 */
export function pluralize(
  count: number,
  forms: Partial<Record<Intl.LDMLPluralRule, string>>,
  locale: Locale,
): string {
  const rule = new Intl.PluralRules(localeConfig[locale].bcp47).select(count);
  return forms[rule] ?? forms.other ?? String(count);
}

/**
 * Get the `og:locale` string for a given locale.
 *
 * @param locale - The locale code.
 * @returns The OG locale format (e.g. `"en_US"`, `"es_ES"`).
 */
export function getOgLocale(locale: Locale): string {
  return localeConfig[locale].ogLocale;
}
