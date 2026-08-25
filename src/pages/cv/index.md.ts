import { generateCvMarkdown } from "@utils/llms";

/**
 * `/cv/index.md` — the markdown twin of the CV page.
 *
 * The spec names a personal site answering questions about someone's CV as one
 * of its motivating cases, and this is the file that makes that answerable
 * without parsing a rendered page or a PDF.
 */
export const prerender = true;

/**
 * Renders the CV as markdown.
 *
 * @param context - Astro endpoint context.
 * @returns A `text/markdown` response.
 */
export async function GET(context: { site: URL }) {
  return new Response(await generateCvMarkdown(context.site.origin, "en"), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
