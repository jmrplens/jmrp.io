import { markdownFor } from "@utils/llms/mdx/types";

/**
 * The player is unwatchable from text, so what is kept is what can still be
 * acted on: the title, and an address the reader can follow or cite.
 *
 * The link is the canonical `youtube.com/watch?v=` form, not the
 * `youtube-nocookie.com/embed/` one the iframe loads. That host is a privacy
 * choice about how this page embeds the player; it is not the address anyone
 * would quote, and an `/embed/` URL handed back to a user looks broken.
 *
 * Dropped: the iframe's loading, sandbox and permission attributes — every one
 * of them is about running the player, and none about what the video says.
 */
const VIDEO = { en: "Video", es: "Vídeo" } as const;

export default markdownFor({
  tag: "YouTube",
  toMarkdown(node, ctx) {
    const id = ctx.attr(node, "id")?.trim();
    // No id means no video to point at, and the component renders an iframe
    // with no children — there is nothing else to salvage.
    if (!id) return "";

    const url = `https://www.youtube.com/watch?v=${id}`;
    const title = ctx.attr(node, "title")?.trim();
    // Untitled embeds fall back on the page to "YouTube Video", which says
    // nothing the URL does not. A bare link is more honest than link text
    // invented to fill the slot.
    return title
      ? `**${VIDEO[ctx.locale]}:** [${title}](${url})`
      : `**${VIDEO[ctx.locale]}:** ${url}`;
  },
});
