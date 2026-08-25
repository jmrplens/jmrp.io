import { generatePublicationsMarkdown } from "@utils/llms";

/**
 * `/es/publications/index.md` — the markdown twin of the publications page.
 *
 * Carries every abstract and DOI, which is what lets a model answer a question
 * ABOUT the research rather than merely cite a title.
 */
export const prerender = true;

/**
 * Renders the publication list as markdown.
 *
 * @param context - Astro endpoint context.
 * @returns A `text/markdown` response.
 */
export async function GET(context: { site: URL }) {
  return new Response(
    await generatePublicationsMarkdown(context.site.origin, "es"),
    { headers: { "Content-Type": "text/markdown; charset=utf-8" } },
  );
}
