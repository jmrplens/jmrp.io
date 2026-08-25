import { generateProfileMarkdown } from "@utils/llms";

/** `/es/about/index.md` — the markdown twin of the about page. */
export const prerender = true;

/**
 * Renders the page as markdown.
 *
 * @param context - Astro endpoint context.
 * @returns A `text/markdown` response.
 */
export async function GET(context: { site: URL }) {
  return new Response(
    await generateProfileMarkdown(context.site.origin, "about", "es"),
    { headers: { "Content-Type": "text/markdown; charset=utf-8" } },
  );
}
