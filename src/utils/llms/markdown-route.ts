import {
  generateLlmsPostTxt,
  generateProfileMarkdown,
  generateToolMarkdown,
} from "@utils/llms";
import { type CollectionEntry, getCollection } from "astro:content";

/**
 * The `/blog/<slug>.md` endpoints, one per locale.
 *
 * ── Why the path mirrors the article ──────────────────────────────────────
 * These files used to live flat at the site root as
 * `/llms-blog-<locale>-<slug>.txt`, which no consumer could derive: an agent
 * holding `/blog/005-foo/` had to invent a prefix AND move the locale from a
 * path segment to a filename infix, while the convention it would actually
 * try — append `.md` — returned 404. The whole history of the access log has
 * 69 fetches of `/llms.txt`, 63 of `/llms-full.txt` and not one of a shard:
 * consumers reach the index and stop, because there is nothing to guess.
 *
 * ── Why `.md` and not `.txt` ──────────────────────────────────────────────
 * The content IS markdown, and since the component converter landed that is
 * finally true rather than aspirational — before it the files carried literal
 * `<Callout type="info">` and raw `<thead>`. Naming them `.md` while they
 * served JSX would have advertised a format they did not honour.
 *
 * Both locales share this factory so the two routes cannot drift in the
 * predicate they use to select posts, which is the same one `getPostsByLocale`
 * applies in `@utils/llms`.
 *
 * @module
 */

/** Astro's endpoint context, narrowed to what these routes read. */
interface RouteContext {
  site: URL;
  props: { post: CollectionEntry<"posts"> };
}

/**
 * Builds the `getStaticPaths` and `GET` pair for one locale's markdown twins.
 *
 * @param locale - The locale whose posts this route serves.
 * @returns The two exports an Astro endpoint needs.
 */
export function markdownRoute(locale: "en" | "es") {
  return {
    /**
     * One route per published post of this locale.
     *
     * @returns The path params and the post each one renders.
     */
    getStaticPaths: async () => {
      // Same predicate as getPostsByLocale() in @utils/llms, so the file set
      // and the index that links to it can never disagree.
      const posts = await getCollection(
        "posts",
        (p) => p.data.lang === locale && !p.data.draft,
      );
      return posts.map((post) => ({
        params: { slug: post.data.slug },
        props: { post },
      }));
    },

    /**
     * Renders one post as a standalone markdown document.
     *
     * `charset=utf-8` is stated explicitly: nginx only appends a charset for
     * the types in `charset_types`, and `text/markdown` is not in its default
     * list, so the header would otherwise carry none and every accented
     * character in the Spanish corpus would be at the client's mercy.
     *
     * @param context - Astro endpoint context.
     * @returns A `text/markdown` response.
     */
    GET: (context: RouteContext) => {
      return new Response(
        generateLlmsPostTxt(context.site.origin, locale, context.props.post),
        { headers: { "Content-Type": "text/markdown; charset=utf-8" } },
      );
    },
  };
}

/** The one header every markdown twin answers with. */
const MARKDOWN_HEADERS = {
  "Content-Type": "text/markdown; charset=utf-8",
} as const;

/**
 * The `/tools/<slug>/index.md` endpoints, one per locale.
 *
 * Same factory shape as the post routes above, and for the same reason: ten
 * near-identical route files is ten places for the content type or the
 * predicate to drift, and SonarCloud counted them as duplication before this
 * existed.
 *
 * @param locale - The locale whose tools this route serves.
 * @returns The two exports an Astro endpoint needs.
 */
export function toolMarkdownRoute(locale: "en" | "es") {
  return {
    getStaticPaths: async () => {
      const tools = await getCollection("tools", (t) => t.data.lang === locale);
      return tools.map((tool) => ({
        params: { slug: tool.data.slug },
        props: { tool },
      }));
    },
    GET: (context: { site: URL; props: { tool: CollectionEntry<"tools"> } }) =>
      new Response(
        generateToolMarkdown(context.site.origin, context.props.tool),
        { headers: MARKDOWN_HEADERS },
      ),
  };
}

/**
 * A singleton page's markdown twin — one URL, no params.
 *
 * @param render - Produces the document for a locale.
 * @param locale - The locale this route serves.
 * @returns The `GET` an Astro endpoint needs.
 */
export function singleMarkdownRoute(
  render: (siteUrl: string, locale: "en" | "es") => Promise<string>,
  locale: "en" | "es",
) {
  return {
    prerender: true,
    GET: async (context: { site: URL }) =>
      new Response(await render(context.site.origin, locale), {
        headers: MARKDOWN_HEADERS,
      }),
  };
}

/**
 * Binds one of the three profile pages to a locale.
 *
 * @param page - Which profile page.
 * @returns A renderer with the signature `singleMarkdownRoute` expects.
 */
export function profileRenderer(page: "about" | "projects" | "uses") {
  return (siteUrl: string, locale: "en" | "es") =>
    generateProfileMarkdown(siteUrl, page, locale);
}
