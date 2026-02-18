import { defaultLocale, type Locale } from "@i18n/config";
import type { CollectionEntry } from "astro:content";
import { getCollection } from "astro:content";

/** A tool entry paired with a flag indicating whether it is a fallback (untranslated). */
export interface LocalizedTool {
  /** The resolved tool collection entry. */
  tool: CollectionEntry<"tools">;
  /** `true` when no translation exists for the requested locale and the EN version is served. */
  isFallback: boolean;
}

/**
 * Returns tools for a given locale with automatic EN fallback.
 *
 * - For the default locale: returns only tools with `lang === defaultLocale`.
 * - For other locales: returns locale-specific tools, plus any EN tools
 *   that have no translation yet (marked as `isFallback: true`).
 *
 * @param locale - The target locale.
 * @returns Array of localized tools.
 */
export async function getToolsForLocale(
  locale: Locale,
): Promise<LocalizedTool[]> {
  const allTools = await getCollection("tools");
  const enTools = allTools.filter((t) => t.data.lang === defaultLocale);

  if (locale === defaultLocale) {
    return enTools.map((tool) => ({ tool, isFallback: false }));
  }

  const localeTools = allTools.filter((t) => t.data.lang === locale);
  const localeSlugs = new Set(localeTools.map((t) => t.data.slug));

  return [
    ...localeTools.map((tool) => ({ tool, isFallback: false })),
    ...enTools
      .filter((t) => !localeSlugs.has(t.data.slug))
      .map((tool) => ({ tool, isFallback: true })),
  ];
}
