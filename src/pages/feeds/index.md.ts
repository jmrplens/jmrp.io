import { generateFeedsMarkdown } from "@utils/llms/listing-markdown";
import { singleMarkdownRoute } from "@utils/llms/markdown-route";

/**
 * `/feeds/index.md` — the markdown twin of the feeds page.
 *
 * Publishes what the page exists to publish: the two RSS URLs and the eight
 * curated Bluesky feed generators, each with its canonical AT Protocol URI.
 */
export const { GET } = singleMarkdownRoute(generateFeedsMarkdown, "en");
