import { toolCategoryMarkdownRoute } from "@utils/llms/markdown-route";

/**
 * `/tools/categories/<category>/index.md` — twin of each category page.
 *
 * Carries the category's own narrative (`<cat>Context`), which says what its
 * tools are FOR — the part a listing of names cannot express.
 */
export const { getStaticPaths, GET } = toolCategoryMarkdownRoute("en");
