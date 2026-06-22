import { generateLlmsFullTxt } from "@utils/llms";

/**
 * Endpoint generating /llms-full.txt — the enriched AI-context file with
 * per-post descriptions, tags, FAQ questions, and HowTo steps, all sourced
 * from the content collections.
 */
export async function GET(context: { site: URL }) {
  const body = await generateLlmsFullTxt(context.site.origin);
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
