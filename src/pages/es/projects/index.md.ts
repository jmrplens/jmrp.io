import { singleMarkdownRoute } from "@utils/llms/markdown-route";
import { projectsPageMarkdown } from "@utils/llms/projects-markdown";

/**
 * `/es/projects/index.md` — the markdown twin of the projects page.
 * See `src/pages/projects/index.md.ts` for why this carries `PRJ_*` tokens.
 */
export const { GET } = singleMarkdownRoute(projectsPageMarkdown, "es");
