import { homeRenderer, singleMarkdownRoute } from "@utils/llms/markdown-route";

/** `/es/index.md` — the markdown twin of the Spanish homepage. */
export const { GET } = singleMarkdownRoute(homeRenderer(), "es");
