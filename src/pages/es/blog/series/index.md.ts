import { generateSeriesIndexMarkdown } from "@utils/llms/listing-markdown";
import { singleMarkdownRoute } from "@utils/llms/markdown-route";

/** `/es/blog/series/index.md` — Spanish markdown twin of the series index. */
export const { GET } = singleMarkdownRoute(generateSeriesIndexMarkdown, "es");
