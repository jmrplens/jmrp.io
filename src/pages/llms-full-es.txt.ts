import { generateLlmsFullTxt } from "@utils/llms";

/**
 * Endpoint generating /llms-full-es.txt — the Spanish half of the enriched
 * AI-context document.
 *
 * See `llms-full-en.txt.ts` for why the split exists. This is the half that a
 * silent truncation of the combined file drops, since the Spanish corpus is
 * emitted last.
 */
export async function GET(context: { site: URL }) {
  const body = await generateLlmsFullTxt(context.site.origin, "es");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
