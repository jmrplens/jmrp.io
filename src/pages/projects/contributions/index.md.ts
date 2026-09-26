import { singleMarkdownRoute } from "@utils/llms/markdown-route";
import { contributionsPageMarkdown } from "@utils/llms/projects-markdown";

/**
 * `/projects/contributions/index.md` — the markdown twin of the open-source
 * contributions subpage. 100% build-time: no `PRJ_*` token, unlike
 * `/projects/index.md`.
 */
export const { GET } = singleMarkdownRoute(contributionsPageMarkdown, "en");
