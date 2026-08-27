import { toolCategoryMarkdownRoute } from "@utils/llms/markdown-route";

/** `/es/tools/categories/<category>/index.md` — Spanish category twin. */
export const { getStaticPaths, GET } = toolCategoryMarkdownRoute("es");
