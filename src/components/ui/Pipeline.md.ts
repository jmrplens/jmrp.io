import { markdownFor } from "@utils/llms/mdx/types";

/** One stage of the pipeline. */
interface Stage {
  name?: string;
  note?: string;
  via?: string;
}

const LABEL = {
  en: { via: "via" },
  es: { via: "vía" },
} as const;

/**
 * A pipeline states an order, so it becomes a numbered list — the one structure
 * markdown already has for "these happen in this sequence".
 *
 * `via` labels the arrow INTO a stage, i.e. what the previous stage hands over,
 * and it is kept: in post 011 those labels are what turn a row of boxes into a
 * fail-closed argument ("gate", "no trust yet"). It is rendered as a suffix
 * rather than a separate item because it belongs to the transition, not to a
 * step of its own.
 *
 * Dropped: `color`, and the horizontal-versus-vertical layout.
 */
export default markdownFor({
  tag: "Pipeline",
  toMarkdown(node, ctx) {
    const stages = ctx.expr<Stage[]>(node, "stages");
    if (!Array.isArray(stages) || stages.length === 0) return ctx.body(node);

    const via = LABEL[ctx.locale].via;
    const list = stages
      .map((stage, index) => {
        const note = stage?.note ? ` — ${stage.note}` : "";
        const handover = stage?.via ? ` (${via}: ${stage.via})` : "";
        return `${index + 1}. \`${stage?.name ?? ""}\`${note}${handover}`;
      })
      .join("\n");

    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [title ? `**${title}**` : "", list, caption ?? ""]
      .filter(Boolean)
      .join("\n\n");
  },
});
