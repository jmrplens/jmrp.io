import { generatePageMarkdown } from "@utils/llms";

/** `/privacy/index.md` — the markdown twin of the privacy page. */
export const prerender = true;

/**
 * Renders the privacy policy as markdown.
 *
 * @param context - Astro endpoint context.
 * @returns A `text/markdown` response.
 */
export async function GET(context: { site: URL }) {
  return new Response(
    await generatePageMarkdown(context.site.origin, "privacy", "en"),
    { headers: { "Content-Type": "text/markdown; charset=utf-8" } },
  );
}
