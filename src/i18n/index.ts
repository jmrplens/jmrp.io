/**
 * i18n module barrel export.
 *
 * @example
 * ```astro
 * ---
 * import { getLangFromUrl, useTranslations, formatDate } from "@i18n";
 * const lang = getLangFromUrl(Astro.url);
 * const t = useTranslations(lang);
 * ---
 * <h1>{t("nav.home")}</h1>
 * <time>{formatDate(post.data.publishedDate, lang)}</time>
 * ```
 */
export {
  defaultLocale,
  type Locale,
  type LocaleConfig,
  localeConfig,
  locales,
} from "./config";
export { type Translations, translations } from "./translations";
export {
  formatDate,
  formatNumber,
  getAlternateLinks,
  getLangFromUrl,
  getOgLocale,
  pluralize,
  stripLocalePrefix,
  type TranslationKey,
  useTranslatedPath,
  useTranslations,
} from "./utils";
