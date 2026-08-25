import { markdownFor } from "@utils/llms/mdx/types";

/** One bit-field of the register. */
interface Field {
  name?: string;
  bits?: number | string;
  note?: string;
}

const LABEL = {
  en: { bits: "Bits", field: "Field", note: "Note" },
  es: { bits: "Bits", field: "Campo", note: "Nota" },
} as const;

/**
 * The fact a register map carries is which bits belong to which field. That is
 * already in the `fields` prop, so this module's only real work is ordering:
 * fields may be declared in any order, and the diagram reads MSB → LSB, so the
 * rows are sorted that way to give one canonical reading order.
 *
 * The reserved gaps the component auto-fills are NOT synthesized here: they are
 * exactly "every bit below `width` that no field claims", which follows from the
 * two things the table already states, and range-merging them would be more code
 * than the derivation is worth.
 *
 * Dropped: `color`. The `Note` column is omitted when no field has one.
 */
export default markdownFor({
  tag: "RegisterMap",
  toMarkdown(node, ctx) {
    const fields = ctx.expr<Field[]>(node, "fields");
    if (!Array.isArray(fields) || fields.length === 0) return ctx.body(node);

    const label = LABEL[ctx.locale];
    /**
     * Parses a `bits` prop: a single bit, or an inclusive "hi:lo" range.
     *
     * @param bits - The prop value.
     * @returns The high and low bit indices.
     */
    const range = (bits: number | string | undefined): [number, number] => {
      if (typeof bits === "number") return [bits, bits];
      const parts = (bits ?? "")
        .split(":")
        .map((part) => Number.parseInt(part.trim(), 10));
      const high = parts[0] ?? 0;
      const low = Number.isNaN(parts[1]) ? high : (parts[1] ?? high);
      return [Math.max(high, low), Math.min(high, low)];
    };

    const hasNotes = fields.some((f) => f?.note);
    const rows = fields
      .map((field) => ({ field, span: range(field?.bits) }))
      .toSorted((a, b) => b.span[0] - a.span[0])
      .map(({ field, span }) => {
        const bits =
          span[0] === span[1] ? String(span[0]) : `${span[0]}:${span[1]}`;
        const cells = [bits, `\`${field?.name ?? ""}\``];
        if (hasNotes) cells.push(field?.note ?? "");
        return `| ${cells.join(" | ")} |`;
      });

    const columns = hasNotes
      ? [label.bits, label.field, label.note]
      : [label.bits, label.field];
    const head = `| ${columns.join(" | ")} |`;
    const rule = `| ${columns.map(() => "---").join(" | ")} |`;

    const width = ctx.expr<number>(node, "width") ?? 16;
    const title = ctx.attr(node, "title");
    // The width is part of the fact — bit 15 of a 16-bit register is the MSB,
    // bit 15 of a 32-bit one is not — so it rides along with the title.
    const heading = title ? `**${title}** (${width} bits)` : `**${width}-bit**`;
    const caption = ctx.attr(node, "caption");
    return [heading, [head, rule, ...rows].join("\n"), caption ?? ""]
      .filter(Boolean)
      .join("\n\n");
  },
});
