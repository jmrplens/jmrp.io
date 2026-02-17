/**
 * Internationalization (i18n) configuration.
 *
 * Defines supported locales, default locale, and locale metadata.
 * This is the single source of truth for i18n settings used across the project.
 */

/** Supported locale codes. */
export type Locale = "en" | "es";

/** Configuration metadata for each locale. */
export interface LocaleConfig {
  /** Human-readable locale name in its own language. */
  readonly label: string;
  /** BCP 47 language tag used by `Intl` APIs and `og:locale`. */
  readonly bcp47: string;
  /** Open Graph locale format (language_TERRITORY). */
  readonly ogLocale: string;
  /** Text direction. */
  readonly dir: "ltr" | "rtl";
  /** Flag emoji for visual indicator. */
  readonly flag: string;
}

/** The default (unprefixed) locale. */
export const defaultLocale: Locale = "en";

/** All supported locales in display order. */
export const locales: readonly Locale[] = ["en", "es"] as const;

/** Metadata for each locale. */
export const localeConfig: Record<Locale, LocaleConfig> = {
  en: {
    label: "English",
    bcp47: "en-US",
    ogLocale: "en_US",
    dir: "ltr",
    flag: "🇺🇸",
  },
  es: {
    label: "Español",
    bcp47: "es-ES",
    ogLocale: "es_ES",
    dir: "ltr",
    flag: "🇪🇸",
  },
} as const;
