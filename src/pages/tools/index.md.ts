import { generateToolsIndexMarkdown } from "@utils/llms/listing-markdown";
import { singleMarkdownRoute } from "@utils/llms/markdown-route";

/** `/tools/index.md` — the markdown twin of the tools listing. */
export const { GET } = singleMarkdownRoute(generateToolsIndexMarkdown, "en");
