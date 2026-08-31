import { pageRenderer, singleMarkdownRoute } from "@utils/llms/markdown-route";

/** `/license/index.md` — the markdown twin of the license page. */
export const { GET } = singleMarkdownRoute(pageRenderer("license"), "en");
