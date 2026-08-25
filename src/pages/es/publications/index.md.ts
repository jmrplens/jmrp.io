import { generatePublicationsMarkdown } from "@utils/llms";
import { singleMarkdownRoute } from "@utils/llms/markdown-route";

/**
 * `/es/publications/index.md` — the markdown twin of the publications page.
 *
 * Carries every abstract and DOI, which is what lets a model answer a question
 * ABOUT the research rather than merely cite a title.
 */
export const { prerender, GET } = singleMarkdownRoute(
  generatePublicationsMarkdown,
  "es",
);
