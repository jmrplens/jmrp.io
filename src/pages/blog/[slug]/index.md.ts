import { markdownRoute } from "@utils/llms/markdown-route";

/**
 * `/blog/<slug>/index.md` — the English markdown twin of every post.
 *
 * See `markdownRoute()` for why this path shape replaced the flat
 * `/llms-blog-<locale>-<slug>.txt` one, and `markdownTwinPath()` for why the
 * spec's form for a URL with no file name is `index.md`.
 */
export const { getStaticPaths, GET } = markdownRoute("en");
