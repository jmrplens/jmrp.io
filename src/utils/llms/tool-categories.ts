/**
 * The tool categories, shared by every surface that names them.
 *
 * A leaf module rather than a second home in `@utils/llms/listing-markdown`,
 * where these two used to live: `llms.ts` needs both to publish the category
 * index (audit #6, M5), and importing them from `listing-markdown` — which
 * imports `@utils/llms` — would close the cycle. Nothing here is imported at
 * runtime, only types, so this module can sit under everything else.
 */
import type { TranslationKey, useTranslations } from "@i18n/utils";

/**
 * Category order, matching `categoryMeta` in ToolsIndex/ToolCategoryPage.
 *
 * Declared here rather than imported because those live in `.astro`
 * frontmatter, which a `.ts` module cannot import from. A category the tools
 * no longer use simply renders nothing.
 */
export const CATEGORY_ORDER = [
  "security",
  "developer",
  "network",
  "embedded",
  "mikrotik",
] as const;

/**
 * `pages.tools.categorySecurity` and friends, assembled from the id.
 *
 * @param t - The locale's translation function.
 * @param category - Category id, e.g. `security`.
 * @returns The category's name in that locale.
 */
export function categoryName(
  t: ReturnType<typeof useTranslations>,
  category: string,
): string {
  const capitalized = category.charAt(0).toUpperCase() + category.slice(1);
  return t(`pages.tools.category${capitalized}` as TranslationKey);
}
