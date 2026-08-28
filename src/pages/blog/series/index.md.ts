import { generateSeriesIndexMarkdown } from "@utils/llms/listing-markdown";
import { singleMarkdownRoute } from "@utils/llms/markdown-route";

/** `/blog/series/index.md` — the markdown twin of the series index. */
export const { GET } = singleMarkdownRoute(generateSeriesIndexMarkdown, "en");
