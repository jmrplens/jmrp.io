import { generateProfileMarkdown } from "@utils/llms";

/** `/es/uses/index.md` — the markdown twin of the uses page. */
export const prerender = true;

/**
 * Renders the page as markdown.
 *
 * @param context - Astro endpoint context.
 * @returns A `text/markdown` response.
 */
export async function GET(context: { site: URL }) {
  return new Response(
    await generateProfileMarkdown(context.site.origin, "uses", "es"),
    { headers: { "Content-Type": "text/markdown; charset=utf-8" } },
  );
}
