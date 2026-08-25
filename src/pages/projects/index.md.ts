import { generateProfileMarkdown } from "@utils/llms";

/** `/projects/index.md` — the markdown twin of the projects page. */
export const prerender = true;

/**
 * Renders the page as markdown.
 *
 * @param context - Astro endpoint context.
 * @returns A `text/markdown` response.
 */
export async function GET(context: { site: URL }) {
  return new Response(
    await generateProfileMarkdown(context.site.origin, "projects", "en"),
    { headers: { "Content-Type": "text/markdown; charset=utf-8" } },
  );
}
