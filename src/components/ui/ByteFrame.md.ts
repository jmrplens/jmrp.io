import { markdownFor } from "@utils/llms/mdx/types";

/** One field of the frame. */
interface Field {
  label?: string;
  bytes?: number;
  variable?: boolean;
  note?: string;
}

const LABEL = {
  en: { offset: "Offset", field: "Field", size: "Size", note: "Note" },
  es: { offset: "Offset", field: "Campo", size: "Tamaño", note: "Nota" },
} as const;

/**
 * A byte frame answers one question — which byte does each field start at, and
 * how many does it take — so it becomes the table the drawing stands for. The
 * offsets are the part the source never states: the props only carry sizes.
 *
 * A variable-length field reports `variable` rather than its `bytes` prop,
 * because that number is a representative width chosen to make the bar look
 * right, not the real size; publishing it as fact would be a lie. Everything
 * after such a field gets a `~` offset for the same reason — the component
 * marks those approximate too.
 *
 * Dropped: `color`. The `Note` column is omitted entirely when no field has one.
 */
export default markdownFor({
  tag: "ByteFrame",
  toMarkdown(node, ctx) {
    const fields = ctx.expr<Field[]>(node, "fields");
    if (!Array.isArray(fields) || fields.length === 0) return ctx.body(node);

    const label = LABEL[ctx.locale];
    const hasNotes = fields.some((f) => f?.note);

    let offset = 0;
    let approximate = false;
    const rows = fields.map((field) => {
      const bytes = Math.max(0, Number(field?.bytes) || 0);
      const at = `${approximate ? "~" : ""}${offset}`;
      const size = field?.variable ? "variable" : `${bytes} B`;
      offset += bytes;
      if (field?.variable) approximate = true;
      const note = hasNotes ? ` | ${field?.note ?? ""}` : "";
      return `| ${at} | \`${field?.label ?? ""}\` | ${size}${note} |`;
    });

    const head = hasNotes
      ? `| ${label.offset} | ${label.field} | ${label.size} | ${label.note} |`
      : `| ${label.offset} | ${label.field} | ${label.size} |`;
    const rule = hasNotes
      ? "| ---: | --- | ---: | --- |"
      : "| ---: | --- | ---: |";

    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [
      title ? `**${title}**` : "",
      [head, rule, ...rows].join("\n"),
      caption ?? "",
    ]
      .filter(Boolean)
      .join("\n\n");
  },
});
