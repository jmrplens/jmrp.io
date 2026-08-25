import { markdownFor } from "@utils/llms/mdx/types";

/** One header field. */
interface Field {
  name?: string;
  bits?: number;
}

const LABEL = {
  en: { bits: "Bits", field: "Field" },
  es: { bits: "Bits", field: "Campo" },
} as const;

/**
 * An RFC header diagram states where each field sits in the bit stream. The
 * props only give widths, so the running bit offsets — the half a reader
 * actually needs to parse bytes off a wire — are computed here.
 *
 * Dropped: the row wrapping and the field splitting that goes with it. A field
 * straddling a row boundary is an artifact of drawing 32 bits per line; its bit
 * range is continuous either way, and splitting it into two rows here would
 * invent a discontinuity the protocol does not have. The row width is kept in
 * the heading, since it is the header's word size. Also dropped: `color`.
 */
export default markdownFor({
  tag: "PacketDiagram",
  toMarkdown(node, ctx) {
    const fields = ctx.expr<Field[]>(node, "fields");
    if (!Array.isArray(fields) || fields.length === 0) return ctx.body(node);

    const label = LABEL[ctx.locale];
    let bit = 0;
    const rows = fields.map((field) => {
      const width = Math.max(1, Number(field?.bits) || 1);
      const span = width === 1 ? String(bit) : `${bit}–${bit + width - 1}`;
      bit += width;
      return `| ${span} | ${field?.name ?? ""} |`;
    });

    const bitsPerRow = ctx.expr<number>(node, "bitsPerRow") ?? 32;
    const title = ctx.attr(node, "title");
    const heading = title
      ? `**${title}** (${bitsPerRow} bits/row)`
      : `**${bitsPerRow} bits/row**`;
    const caption = ctx.attr(node, "caption");
    return [
      heading,
      [`| ${label.bits} | ${label.field} |`, "| --- | --- |", ...rows].join(
        "\n",
      ),
      caption ?? "",
    ]
      .filter(Boolean)
      .join("\n\n");
  },
});
