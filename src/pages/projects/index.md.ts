import {
  profileRenderer,
  singleMarkdownRoute,
} from "@utils/llms/markdown-route";

/** `/projects/index.md` — the markdown twin of the projects page. */
export const { GET } = singleMarkdownRoute(profileRenderer("projects"), "en");
