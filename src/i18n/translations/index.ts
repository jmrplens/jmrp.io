/**
 * Translation barrel export.
 *
 * Re-exports all translation namespaces for each locale and provides
 * the `Translations` type and `translations` map used by `useTranslations()`.
 */
import type { Locale } from "../config";

import { common as enCommon } from "./en/common";
import { common as esCommon } from "./es/common";

/** All translation namespaces merged into a single object per locale. */
export const translations = {
  en: { ...enCommon },
  es: { ...esCommon },
} as const;

/** The full translation tree type — uses string values (not literal types). */
export type Translations = {
  [K in keyof typeof translations.en]: {
    [J in keyof (typeof translations.en)[K]]: string;
  };
};

/**
 * Get the full translations object for a given locale.
 *
 * @param locale - The locale code.
 * @returns The translations object for the locale.
 */
export function getTranslations(locale: Locale): Translations {
  return translations[locale] as Translations;
}
