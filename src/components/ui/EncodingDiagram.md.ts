import { markdownFor } from "@utils/llms/mdx/types";

/** One token → bytes row. */
interface Row {
  label?: string;
  bytes?: string[];
  note?: string;
}

const LABEL = {
  en: { token: "Token", bytes: "Bytes", note: "Note" },
  es: { token: "Token", bytes: "Bytes", note: "Nota" },
} as const;

/**
 * A token and the bytes it encodes to — a two-column fact that was already a
 * table before it was a diagram. The byte chips are joined with spaces so a row
 * reads as one hex string (`E2 82 AC`), which is how such bytes are quoted
 * everywhere else.
 *
 * Dropped: the per-byte color rotation, which exists to keep adjacent chips
 * visually distinct. The `Note` column is omitted when no row has one.
 */
export default markdownFor({
  tag: "EncodingDiagram",
  toMarkdown(node, ctx) {
    const rows = ctx.expr<Row[]>(node, "rows");
    if (!Array.isArray(rows) || rows.length === 0) return ctx.body(node);

    const label = LABEL[ctx.locale];
    const hasNotes = rows.some((r) => r?.note);
    const body = rows.map((row) => {
      const cells = [row?.label ?? "", `\`${(row?.bytes ?? []).join(" ")}\``];
      if (hasNotes) cells.push(row?.note ?? "");
      return `| ${cells.join(" | ")} |`;
    });

    const columns = hasNotes
      ? [label.token, label.bytes, label.note]
      : [label.token, label.bytes];
    const table = [
      `| ${columns.join(" | ")} |`,
      `| ${columns.map(() => "---").join(" | ")} |`,
      ...body,
    ].join("\n");

    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [title ? `**${title}**` : "", table, caption ?? ""]
      .filter(Boolean)
      .join("\n\n");
  },
});
