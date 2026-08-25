import { markdownFor } from "@utils/llms/mdx/types";

/**
 * One integer in four bases, which is one line of text — the grid is alignment,
 * not information. The conversions are recomputed because the MDX source holds a
 * single numeric literal (`value={0xb8}` reaches the AST as `184`), so without
 * them the output would drop the three bases the figure was added to show.
 *
 * The binary is emitted unbroken rather than nibble-grouped: `0b10111000` is a
 * literal any reader can paste, while `0b1011 1000` is a display convention.
 */
export default markdownFor({
  tag: "NumberBases",
  toMarkdown(node, ctx) {
    const value = ctx.expr<number>(node, "value");
    if (typeof value !== "number") return ctx.body(node);
    const bits = ctx.expr<number>(node, "bits") ?? 8;

    const u = value >>> 0;
    const hex = u
      .toString(16)
      .toUpperCase()
      .padStart(Math.ceil(bits / 4), "0");
    const binary = u.toString(2).padStart(bits, "0");
    const line =
      `\`0x${hex}\` = \`${u}\` = \`0o${u.toString(8)}\` = ` +
      `\`0b${binary}\` (${bits} bits)`;

    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [title ? `**${title}**` : "", line, caption ?? ""]
      .filter(Boolean)
      .join("\n\n");
  },
});
