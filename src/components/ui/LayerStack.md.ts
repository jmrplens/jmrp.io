import { markdownFor } from "@utils/llms/mdx/types";

/** One band of the stack. */
interface Layer {
  name?: string;
  note?: string;
}

const LABEL = {
  en: { order: "top to bottom" },
  es: { order: "de arriba abajo" },
} as const;

/**
 * A stack of bands is an ordered list drawn vertically, so it becomes an ordered
 * list. What a numbered list does NOT carry is which end of the stack item 1 is,
 * and that is the whole meaning here — the top band is the caller, the bottom
 * one is the silicon — so the direction is stated once above the list.
 *
 * Dropped: `color` and the accent on the top band, which are emphasis, not
 * structure.
 */
export default markdownFor({
  tag: "LayerStack",
  toMarkdown(node, ctx) {
    const layers = ctx.expr<Layer[]>(node, "layers");
    if (!Array.isArray(layers) || layers.length === 0) return ctx.body(node);

    const order = LABEL[ctx.locale].order;
    const list = layers
      .map((layer, index) => {
        const note = layer?.note ? ` — ${layer.note}` : "";
        return `${index + 1}. \`${layer?.name ?? ""}\`${note}`;
      })
      .join("\n");

    const title = ctx.attr(node, "title");
    const heading = title ? `**${title}** (${order})` : `*(${order})*`;
    const caption = ctx.attr(node, "caption");
    return [heading, list, caption ?? ""].filter(Boolean).join("\n\n");
  },
});
