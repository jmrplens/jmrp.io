import { markdownFor } from "@utils/llms/mdx/types";

/**
 * The card is chrome around a single fact: a real file can be fetched from a
 * real URL. That fact survives as a link; nothing else on the card does.
 *
 * Kept: the display name, the description, and an ABSOLUTE URL — `href` is
 * root-relative, and a root-relative link means nothing once the markdown is
 * read away from the site it came from.
 *
 * Dropped: `icon` (a glyph), and the byte size plus line count that the
 * component reads off disk at build time. "3.6 KB" is not something a model
 * can act on, and recomputing it here would tie the converter to `public/`
 * being on disk — a dependency the rest of this pipeline does not have.
 */
const DOWNLOAD = { en: "Download", es: "Descarga" } as const;

export default markdownFor({
  tag: "FileDownload",
  toMarkdown(node, ctx) {
    const href = ctx.attr(node, "href")?.trim();
    // The component throws without an href, so there is no content to fall
    // back to: emitting nothing is the honest result.
    if (!href) return "";

    const path = href.startsWith("/") ? href : `/${href}`;
    const name = ctx.attr(node, "filename") ?? path.split("/").pop() ?? path;
    const url = `${ctx.siteUrl.replace(/\/$/u, "")}${path}`;
    const description = ctx.attr(node, "description");
    const tail = description ? ` — ${description}` : "";
    return `**${DOWNLOAD[ctx.locale]}:** [${name}](${url})${tail}`;
  },
});
