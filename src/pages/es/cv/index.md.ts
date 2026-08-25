import { generateCvMarkdown } from "@utils/llms";
import { singleMarkdownRoute } from "@utils/llms/markdown-route";

/**
 * `/es/cv/index.md` — the markdown twin of the CV page.
 *
 * The spec names a personal site answering questions about someone's CV as one
 * of its motivating cases, and this is the file that makes that answerable
 * without parsing a rendered page or a PDF.
 */
export const { GET } = singleMarkdownRoute(generateCvMarkdown, "es");
