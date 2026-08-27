import { generateLlmsFullTxt } from "@utils/llms";

/**
 * Endpoint generating /llms-full.txt — the enriched AI-context file with
 * per-post descriptions, tags, FAQ questions, and HowTo steps, all sourced
 * from the content collections.
 */
export async function GET(context: { site: URL }) {
  const body = await generateLlmsFullTxt(context.site.origin);
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
