import { markdownRoute } from "@utils/llms/markdown-route";

/** `/es/blog/<slug>.md` — the Spanish markdown twin of every post. */
export const { getStaticPaths, GET } = markdownRoute("es");
