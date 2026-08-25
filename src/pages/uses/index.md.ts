import {
  profileRenderer,
  singleMarkdownRoute,
} from "@utils/llms/markdown-route";

/** `/uses/index.md` — the markdown twin of the uses page. */
export const { GET } = singleMarkdownRoute(profileRenderer("uses"), "en");
