import { markdownFor } from "@utils/llms/mdx/types";

/**
 * A pros/cons list whose `kind` is drawn as a colored `i-mdi:*` glyph — the
 * only place the polarity of an item exists. "Nonce reuse is catastrophic" is
 * a `warn` and "EtM is provably the safe composition" a `pro`; strip the icons
 * and both are just sentences in the same list, which is precisely the reading
 * the component exists to prevent.
 *
 * Kept: the polarity of every item, its text, and `ariaLabel` — which names
 * what the list is weighing ("AES-GCM trade-offs") and is the only such anchor
 * once the surrounding two-column layout is gone. Dropped: nothing.
 */
const LABEL = {
  en: { pro: "Pro", con: "Con", warn: "Caveat", info: "Note" },
  es: { pro: "A favor", con: "En contra", warn: "Salvedad", info: "Nota" },
} as const;

interface IconItem {
  kind?: keyof (typeof LABEL)["en"];
  text?: string;
}

export default markdownFor({
  tag: "IconList",
  toMarkdown(node, ctx) {
    const items = ctx.expr<IconItem[]>(node, "items");
    if (!Array.isArray(items)) return ctx.body(node);

    const bullets = items.flatMap((item) => {
      const text = item?.text?.trim();
      if (!text) return [];
      const label = item.kind ? LABEL[ctx.locale][item.kind] : undefined;
      return [label ? `- **${label}** — ${text}` : `- ${text}`];
    });
    if (bullets.length === 0) return ctx.body(node);

    const title = ctx.attr(node, "ariaLabel");
    return (title ? `**${title}**\n\n` : "") + bullets.join("\n");
  },
});
