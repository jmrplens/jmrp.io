import { markdownFor } from "@utils/llms/mdx/types";

/**
 * The diagram lines operand bits up above the result so the reader can see
 * which bits survived. The equivalent in text is the expression itself, written
 * out in binary and hex — no alignment needed, and the result is the fact the
 * figure exists to state.
 *
 * The result is recomputed here (masked to `width`, as the component does)
 * because the props carry only the inputs: without it the output would say
 * "0xB2 and 0x0F were ANDed" and leave the answer on the page.
 *
 * Dropped: nothing but the layout. `aLabel`/`bLabel` become the names in the
 * expression, so `flags & mask` reads the way the figure does.
 */
export default markdownFor({
  tag: "BitwiseOp",
  toMarkdown(node, ctx) {
    const a = ctx.expr<number>(node, "a");
    const op = ctx.attr(node, "op");
    if (typeof a !== "number" || !op) return ctx.body(node);
    const b = ctx.expr<number>(node, "b") ?? 0;
    const width = ctx.expr<number>(node, "width") ?? 8;

    const mask = width >= 32 ? -1 >>> 0 : (1 << width) - 1;
    /**
     * Renders a value as padded binary and hex, masked to the bit width.
     *
     * @param value - The value to render.
     * @returns The `0b… = 0x…` pair.
     */
    const show = (value: number): string => {
      const u = (value & mask) >>> 0;
      const binary = u.toString(2).padStart(width, "0");
      const hex = u
        .toString(16)
        .toUpperCase()
        .padStart(Math.ceil(width / 4), "0");
      return `\`0b${binary}\` = \`0x${hex}\``;
    };

    let result: number;
    switch (op) {
      case "&": {
        result = a & b;
        break;
      }
      case "|": {
        result = a | b;
        break;
      }
      case "^": {
        result = a ^ b;
        break;
      }
      case "<<": {
        result = a << b;
        break;
      }
      case ">>": {
        result = a >> b;
        break;
      }
      case "~": {
        result = ~a;
        break;
      }
      // An operator the component itself cannot draw: fall back rather than
      // publish a made-up answer.
      default: {
        return ctx.body(node);
      }
    }

    const aLabel = ctx.attr(node, "aLabel") ?? "a";
    const bLabel = ctx.attr(node, "bLabel") ?? "b";
    const isShift = op === "<<" || op === ">>";
    const isUnary = op === "~";
    // A shift's right-hand side is the amount itself, not a named operand.
    const right = isShift ? b : bLabel;
    const expression = isUnary ? `~${aLabel}` : `${aLabel} ${op} ${right}`;

    const lines = [`- \`${aLabel}\` = ${show(a)}`];
    if (!isUnary && !isShift) lines.push(`- \`${bLabel}\` = ${show(b)}`);
    lines.push(`- \`${expression}\` = ${show(result)}`);

    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [title ? `**${title}**` : "", lines.join("\n"), caption ?? ""]
      .filter(Boolean)
      .join("\n\n");
  },
});
