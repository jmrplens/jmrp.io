import { homeRenderer, singleMarkdownRoute } from "@utils/llms/markdown-route";

/** `/index.md` — the markdown twin of the homepage. */
export const { GET } = singleMarkdownRoute(homeRenderer(), "en");
