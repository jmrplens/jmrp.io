import { markdownFor } from "@utils/llms/mdx/types";

/** One node of a chain or one parallel branch. */
interface FJNode {
  name?: string;
  note?: string;
}

const LABEL = {
  en: { splits: "splits into", joins: "joins into" },
  es: { splits: "se divide en", joins: "confluye en" },
} as const;

/**
 * The shape is the message: one chain forks into parallel artifacts and those
 * artifacts feed a second chain. Arrows for the sequential runs and `+` for the
 * parallel middle say that in three lines, where a table would flatten exactly
 * the distinction the diagram was drawn to make — `kPool` and `kOffsets` are
 * produced together, not one after the other.
 *
 * `beforeLabel` / `afterLabel` are kept because they are the phase boundary
 * (build time versus runtime), which is a claim about WHEN, not about layout.
 * Dropped: the SVG fan geometry and `color`.
 */
export default markdownFor({
  tag: "ForkJoin",
  toMarkdown(node, ctx) {
    const branches = ctx.expr<FJNode[]>(node, "branches");
    if (!Array.isArray(branches) || branches.length === 0)
      return ctx.body(node);

    const label = LABEL[ctx.locale];
    /**
     * Renders one node as `name` plus its note in parentheses.
     *
     * @param item - The node.
     * @returns The rendered node.
     */
    const one = (item: FJNode): string => {
      const note = item?.note ? ` (${item.note})` : "";
      return `\`${item?.name ?? ""}\`${note}`;
    };
    /**
     * Renders a linear chain as an arrow sequence.
     *
     * @param chain - The nodes, in order.
     * @returns The rendered chain.
     */
    const flow = (chain: FJNode[]): string => chain.map(one).join(" → ");

    const before = ctx.expr<FJNode[]>(node, "before") ?? [];
    const after = ctx.expr<FJNode[]>(node, "after") ?? [];
    const beforeLabel = ctx.attr(node, "beforeLabel");
    const afterLabel = ctx.attr(node, "afterLabel");

    const lines: string[] = [];
    if (before.length > 0) {
      const phase = beforeLabel ? `${beforeLabel}: ` : "";
      lines.push(`- ${phase}${flow(before)}`);
    }
    lines.push(`- ${label.splits}: ${branches.map(one).join(" + ")}`);
    if (after.length > 0) {
      const phase = afterLabel ? ` (${afterLabel})` : "";
      lines.push(`- ${label.joins}${phase}: ${flow(after)}`);
    }

    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [title ? `**${title}**` : "", lines.join("\n"), caption ?? ""]
      .filter(Boolean)
      .join("\n\n");
  },
});
