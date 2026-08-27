import { generateBlogIndexMarkdown } from "@utils/llms/listing-markdown";
import { singleMarkdownRoute } from "@utils/llms/markdown-route";

/** `/es/blog/index.md` — the Spanish markdown twin of the blog listing. */
export const { GET } = singleMarkdownRoute(generateBlogIndexMarkdown, "es");
