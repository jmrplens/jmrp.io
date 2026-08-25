import { table } from "@utils/llms/mdx/markdown-table";
import { markdownFor } from "@utils/llms/mdx/types";

/**
 * A can/can't grid: rows are subjects, columns are capabilities, and each
 * cell is the string `"yes"`, `"no"` or `"na"`. Those three tokens are the
 * component's internal vocabulary — the page never prints them, it prints the
 * author's own words ("Can" / "Cannot", "Closes" / "—") next to a glyph. So
 * the cells are mapped through `yesLabel` / `noLabel` / `naLabel` before they
 * are written out: publishing a row of literal `yes`/`no` would drop the one
 * thing the author chose about the matrix.
 *
 * A cells array is meaningless without its column headers, which is the whole
 * reason this component needs a module: `cells: ["no","yes","no"]` on its own
 * is unreadable. Rows whose length disagrees with the header are padded so
 * the table stays well-formed rather than silently shifting a column.
 *
 * `note` (the small line under a row label) is appended to the label after an
 * em dash — it is usually the definition of the subject (`HMAC(master,
 * "vault-enc")`) and would be lost as a separate column of one-liners.
 *
 * The component's own `yesLabel`/`noLabel` defaults are hardcoded English, so
 * a Spanish page with no explicit labels would print "Yes". This module uses
 * a locale-aware default instead; the divergence is deliberate and the
 * component-side bug is worth fixing separately.
 *
 * Dropped on purpose: the check/cross icons (redundant with the word, which is
 * why the component prints both) and `ariaLabel`, which restates the grid in
 * prose for a reader who cannot see it — a reader who now has the grid.
 */
const LABEL = {
  en: { subject: "Subject", yes: "Yes", no: "No", na: "—" },
  es: { subject: "Sujeto", yes: "Sí", no: "No", na: "—" },
} as const;

interface Row {
  label?: string;
  note?: string;
  cells?: string[];
}

export default markdownFor({
  tag: "CapabilityMatrix",
  toMarkdown(node, ctx) {
    const columns = ctx.expr<string[]>(node, "columns");
    const rows = ctx.expr<Row[]>(node, "rows");
    if (!Array.isArray(columns) || !Array.isArray(rows) || rows.length === 0) {
      return ctx.body(node);
    }

    const fallback = LABEL[ctx.locale];
    const word: Record<string, string> = {
      yes: ctx.attr(node, "yesLabel") ?? fallback.yes,
      no: ctx.attr(node, "noLabel") ?? fallback.no,
      na: ctx.attr(node, "naLabel") ?? fallback.na,
    };

    const head = [
      ctx.attr(node, "subjectHeader") || fallback.subject,
      ...columns,
    ];
    const body = rows.map((row) => {
      const subject = row?.note ? `${row.label} — ${row.note}` : row?.label;
      const cells = columns.map(
        (_, index) => word[row?.cells?.[index] ?? ""] ?? "",
      );
      return [subject, ...cells];
    });

    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [title ? `**${title}**` : "", table(head, body), caption ?? ""]
      .filter(Boolean)
      .join("\n\n");
  },
});
