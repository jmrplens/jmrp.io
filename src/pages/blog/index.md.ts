import { generateBlogIndexMarkdown } from "@utils/llms/listing-markdown";
import { singleMarkdownRoute } from "@utils/llms/markdown-route";

/**
 * `/blog/index.md` — the markdown twin of the blog listing.
 *
 * The listing itself, not the articles: each post already publishes its own
 * twin and this one links to them, which is the same strategy llms-full.txt
 * uses and what keeps any single document small enough to fetch.
 */
export const { GET } = singleMarkdownRoute(generateBlogIndexMarkdown, "en");
