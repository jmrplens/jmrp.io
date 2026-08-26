import {
  profileRenderer,
  singleMarkdownRoute,
} from "@utils/llms/markdown-route";

/** `/about/index.md` — the markdown twin of the about page. */
export const { GET } = singleMarkdownRoute(profileRenderer("about"), "en");
