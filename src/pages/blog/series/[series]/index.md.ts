import { seriesMarkdownRoute } from "@utils/llms/markdown-route";

/**
 * `/blog/series/<slug>/index.md` — the markdown twin of each editorial hub.
 *
 * The densest editorial prose on the site and the only page that says in what
 * ORDER to read a cluster of posts; none of it existed in markdown before.
 */
export const { getStaticPaths, GET } = seriesMarkdownRoute("en");
