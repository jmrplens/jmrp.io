import { pageRenderer, singleMarkdownRoute } from "@utils/llms/markdown-route";

/** `/es/license/index.md` — the markdown twin of the license page. */
export const { GET } = singleMarkdownRoute(pageRenderer("license"), "es");
