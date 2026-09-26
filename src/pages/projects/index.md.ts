import { singleMarkdownRoute } from "@utils/llms/markdown-route";
import { projectsPageMarkdown } from "@utils/llms/projects-markdown";

/**
 * `/projects/index.md` — the markdown twin of the projects page.
 *
 * Unlike most twins, this one carries `PRJ_*` placeholders rather than
 * values for the "Contributions to other projects" summary: nginx
 * substitutes them as the file is served, from the same body filter the HTML
 * page uses. Its nginx location must therefore send `no-store` — see
 * `projects-markdown.ts`'s module doc comment (same reasoning as the
 * homelab twin).
 */
export const { GET } = singleMarkdownRoute(projectsPageMarkdown, "en");
