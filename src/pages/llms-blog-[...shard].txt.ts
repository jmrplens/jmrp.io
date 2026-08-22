import { generateLlmsPostTxt } from "@utils/llms";
import { getCollection } from "astro:content";

/**
 * Emits one `/llms-blog-<locale>-<slug>.txt` per blog post.
 *
 * The twelve English posts were 94.8% of `llms-full-en.txt` (557 KB of 587 KB),
 * so any cap an ingestion pipeline applies landed inside a post rather than at
 * a section boundary. One document per post keeps every file bounded — the
 * largest is 62 KB — and lets an agent fetch the single guide it needs.
 * `llms-full-<locale>.txt` now links to these instead of inlining them.
 *
 * Kept at the site root so the files inherit the `.txt` policy in
 * `jmrp_static_assets.conf` (long cache, and compressible — no `no-transform`).
 *
 * @returns One route per post, in both locales.
 */
export async function getStaticPaths() {
  const entries = await Promise.all(
    (["en", "es"] as const).map(async (locale) => {
      // Same predicate and ordering as getPostsByLocale() in @utils/llms, so
      // the shard set and the index that links to it can never diverge.
      const posts = await getCollection(
        "posts",
        (p) => p.data.lang === locale && !p.data.draft,
      );
      return posts.map((post) => ({
        params: { shard: `${locale}-${post.data.slug}` },
        props: { locale, post },
      }));
    }),
  );
  return entries.flat();
}

/**
 * Renders a single post's standalone AI-context document.
 *
 * @param context - Astro endpoint context carrying the site origin and props.
 * @returns A `text/plain` response with the post body.
 */
export function GET(context: {
  site: URL;
  props: {
    locale: "en" | "es";
    post: Parameters<typeof generateLlmsPostTxt>[2];
  };
}) {
  const { locale, post } = context.props;
  return new Response(generateLlmsPostTxt(context.site.origin, locale, post), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
