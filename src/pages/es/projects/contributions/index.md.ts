import { singleMarkdownRoute } from "@utils/llms/markdown-route";
import { contributionsPageMarkdown } from "@utils/llms/projects-markdown";

/**
 * `/es/projects/contributions/index.md` — the markdown twin of the
 * open-source contributions subpage. 100% build-time.
 */
export const { GET } = singleMarkdownRoute(contributionsPageMarkdown, "es");
