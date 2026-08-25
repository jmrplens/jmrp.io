import { markdownRoute } from "@utils/llms/markdown-route";

/**
 * `/blog/<slug>.md` — the English markdown twin of every post.
 *
 * See `markdownRoute()` for why this path shape replaced the flat
 * `/llms-blog-en-<slug>.txt` one.
 */
export const { getStaticPaths, GET } = markdownRoute("en");
