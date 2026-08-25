import {
  profileRenderer,
  singleMarkdownRoute,
} from "@utils/llms/markdown-route";

/** `/es/uses/index.md` — the markdown twin of the uses page. */
export const { prerender, GET } = singleMarkdownRoute(
  profileRenderer("uses"),
  "es",
);
