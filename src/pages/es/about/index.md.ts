import {
  profileRenderer,
  singleMarkdownRoute,
} from "@utils/llms/markdown-route";

/** `/es/about/index.md` — the markdown twin of the about page. */
export const { prerender, GET } = singleMarkdownRoute(
  profileRenderer("about"),
  "es",
);
