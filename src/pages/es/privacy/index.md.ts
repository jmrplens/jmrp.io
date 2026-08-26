import { pageRenderer, singleMarkdownRoute } from "@utils/llms/markdown-route";

/** `/es/privacy/index.md` — the markdown twin of the privacy page. */
export const { GET } = singleMarkdownRoute(pageRenderer("privacy"), "es");
