import { generateLlmsTxt } from "@utils/llms";

/**
 * Endpoint generating /llms.txt (llmstxt.org standard) from the content
 * collections, so the AI-context index stays in sync with the site.
 */
export async function GET(context: { site: URL }) {
  const body = await generateLlmsTxt(context.site.origin);
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
