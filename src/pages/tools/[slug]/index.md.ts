import { generateToolMarkdown } from "@utils/llms";
import { type CollectionEntry, getCollection } from "astro:content";

/**
 * `/tools/<slug>/index.md` — the English markdown twin of every tool page.
 *
 * The spec asks for a clean markdown version "at the same URL as the original
 * page"; these pages have no file name, so `index.md` is the form that
 * applies. Publishing them is what lets `llms-full.txt` link to a tool's
 * documentation instead of carrying it: the 34 bodies were 82.5% of that file.
 */
export async function getStaticPaths() {
  const tools = await getCollection("tools", (t) => t.data.lang === "en");
  return tools.map((tool) => ({
    params: { slug: tool.data.slug },
    props: { tool },
  }));
}

/**
 * Renders one tool as a standalone markdown document.
 *
 * @param context - Astro endpoint context.
 * @returns A `text/markdown` response.
 */
export function GET(context: {
  site: URL;
  props: { tool: CollectionEntry<"tools"> };
}) {
  return new Response(
    generateToolMarkdown(context.site.origin, context.props.tool),
    { headers: { "Content-Type": "text/markdown; charset=utf-8" } },
  );
}
