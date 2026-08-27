import { generateLlmsTxt } from "@utils/llms";

/**
 * Endpoint generating /llms.txt (llmstxt.org standard) from the content
 * collections, so the AI-context index stays in sync with the site.
 */
export async function GET(context: { site: URL }) {
  const body = await generateLlmsTxt(context.site.origin);
  return new Response(body, {
    // text/markdown, not text/plain: the file IS markdown (the llmstxt.org
    // spec describes it as such) and BaseHead already declares it that way on
    // the `rel="describedby"` link. Declarative in a static build — Astro
    // writes the body to dist/ and drops the header, and both `astro preview`
    // and nginx type by extension — but the three declarations of this one
    // file's type were contradicting each other, and this is the one that
    // lives in the repo. Aligning the server is a separate nginx change.
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
