import { generateFeedsMarkdown } from "@utils/llms/listing-markdown";
import { singleMarkdownRoute } from "@utils/llms/markdown-route";

/** `/es/feeds/index.md` — the Spanish markdown twin of the feeds page. */
export const { GET } = singleMarkdownRoute(generateFeedsMarkdown, "es");
