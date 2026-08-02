import { generateLlmsFullTxt } from "@utils/llms";

/**
 * Endpoint generating /llms-full-en.txt — the English half of the enriched
 * AI-context document.
 *
 * Exists because the combined `/llms-full.txt` is ~1.2 MB and several AI
 * ingestion pipelines truncate a single document below that without reporting
 * it. The combined file emits the Spanish corpus after the English one, so a
 * silent truncation always drops the same half. Publishing each corpus
 * separately means neither depends on the other fitting.
 */
export async function GET(context: { site: URL }) {
  const body = await generateLlmsFullTxt(context.site.origin, "en");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
