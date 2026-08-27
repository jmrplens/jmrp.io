import { generateToolsIndexMarkdown } from "@utils/llms/listing-markdown";
import { singleMarkdownRoute } from "@utils/llms/markdown-route";

/** `/es/tools/index.md` — the Spanish markdown twin of the tools listing. */
export const { GET } = singleMarkdownRoute(generateToolsIndexMarkdown, "es");
