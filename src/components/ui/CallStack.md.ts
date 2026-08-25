import { markdownFor } from "@utils/llms/mdx/types";

/** One call frame. */
interface Frame {
  name?: string;
  detail?: string;
}

const LABEL = {
  en: { order: "outermost frame first" },
  es: { order: "marco más externo primero" },
} as const;

/**
 * Call frames in order, with whatever each one costs or carries. The direction
 * is the part a plain list would lose — frame 1 is the outermost caller and the
 * last one is the deepest — so it is stated above the list.
 *
 * Dropped: `growthLabel` and the growth rail. "deeper ↓" tells a reader which
 * way the drawing grows, which the stated order already answers, and an arrow
 * pointing down means nothing without the drawing it pointed at. Also dropped:
 * `color`.
 */
export default markdownFor({
  tag: "CallStack",
  toMarkdown(node, ctx) {
    const frames = ctx.expr<Frame[]>(node, "frames");
    if (!Array.isArray(frames) || frames.length === 0) return ctx.body(node);

    const order = LABEL[ctx.locale].order;
    const list = frames
      .map((frame, index) => {
        const detail = frame?.detail ? ` — ${frame.detail}` : "";
        return `${index + 1}. \`${frame?.name ?? ""}\`${detail}`;
      })
      .join("\n");

    const title = ctx.attr(node, "title");
    const heading = title ? `**${title}** (${order})` : `*(${order})*`;
    const caption = ctx.attr(node, "caption");
    return [heading, list, caption ?? ""].filter(Boolean).join("\n\n");
  },
});
