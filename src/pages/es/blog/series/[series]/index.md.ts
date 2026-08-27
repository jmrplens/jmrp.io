import { seriesMarkdownRoute } from "@utils/llms/markdown-route";

/** `/es/blog/series/<slug>/index.md` — Spanish twin of each editorial hub. */
export const { getStaticPaths, GET } = seriesMarkdownRoute("es");
