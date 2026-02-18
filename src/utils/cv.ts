/**
 * CV Data Utilities
 *
 * Functions for retrieving and typing the Curriculum Vitae data
 * from the content collection.
 */

import { defaultLocale, type Locale } from "@i18n/config";
import type { CollectionEntry } from "astro:content";
import { getEntry } from "astro:content";

/** Type alias for the data returned by the CV content collection. */
export type CVData = CollectionEntry<"cv">["data"];

/**
 * Reads and parses the CV data from the locale-specific YAML file.
 * Files located at: src/content/cv/{locale}.yaml
 *
 * @param locale - The locale to load (defaults to `defaultLocale`).
 * @returns {Promise<CVData>} Array of CV sections and their contents.
 */
export async function getCVData(
  locale: Locale = defaultLocale,
): Promise<CVData> {
  const entry = await getEntry("cv", locale);
  if (!entry) {
    // Fallback to default locale if requested locale not found
    if (locale !== defaultLocale) {
      const fallback = await getEntry("cv", defaultLocale);
      if (fallback) return fallback.data;
    }
    throw new Error(`Could not find CV data for locale: ${locale}`);
  }
  return entry.data;
}
