/**
 * Translation barrel export.
 *
 * Re-exports all translation namespaces for each locale and provides
 * the `Translations` type and `translations` map used by `useTranslations()`.
 */
import type { Locale } from "../config";
import { common as enCommon } from "./en/common";
import { tools as enTools } from "./en/tools";
import { common as esCommon } from "./es/common";
import { tools as esTools } from "./es/tools";

/** All translation namespaces merged into a single object per locale. */
export const translations = {
  en: { ...enCommon, tools: enTools },
  es: { ...esCommon, tools: esTools },
} as const;

/** The full translation tree type — recursively maps to string leaves. */
type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends Record<string, unknown>
      ? DeepStringify<T[K]>
      : string;
};

/** Fully resolved translation object type for a single locale. */
export type Translations = DeepStringify<typeof translations.en>;

/**
 * Get the full translations object for a given locale.
 *
 * @param locale - The locale code.
 * @returns The translations object for the locale.
 */
export function getTranslations(locale: Locale): Translations {
  return translations[locale] as Translations;
}
