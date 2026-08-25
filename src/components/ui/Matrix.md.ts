import { cell, table } from "@utils/llms/mdx/markdown-table";
import { markdownFor } from "@utils/llms/mdx/types";

/**
 * A labelled 2-D grid — lookup tables, tile maps, adjacency matrices. It is
 * already a `<table>` on the page, so the conversion is close to lossless:
 * `rowHeader` plus `cols` become the header row and each `rows[i]` label
 * heads its own line of `cells[i]`.
 *
 * `highlight` is the one thing that needs translating rather than copying.
 * On the page it is a tinted cell background — colour alone, and therefore
 * nothing at all to a reader without a screen. Here it becomes `**bold**`,
 * which is the closest markdown has to "this cell is the point".
 *
 * Short rows are padded to the header width so a ragged `cells` array cannot
 * silently shift every value one column to the left.
 *
 * Dropped on purpose: `ariaLabel`, which is generated chrome ("Matrix with 3
 * rows and 3 columns") rather than content.
 */
interface MatrixProps {
  cols?: (string | number)[];
  rows?: (string | number)[];
  cells?: (string | number)[][];
  highlight?: [number, number][];
}

export default markdownFor({
  tag: "Matrix",
  toMarkdown(node, ctx) {
    const cols = ctx.expr<MatrixProps["cols"]>(node, "cols");
    const rows = ctx.expr<MatrixProps["rows"]>(node, "rows");
    const cells = ctx.expr<MatrixProps["cells"]>(node, "cells");
    if (!Array.isArray(cols) || !Array.isArray(rows) || !Array.isArray(cells)) {
      return ctx.body(node);
    }

    const highlight = ctx.expr<MatrixProps["highlight"]>(node, "highlight");
    const marked = new Set(
      (Array.isArray(highlight) ? highlight : []).map(
        (pair) => `${pair?.[0]}:${pair?.[1]}`,
      ),
    );

    const head = [ctx.attr(node, "rowHeader") ?? "", ...cols.map(String)];
    const body = rows.map((label, rowIndex) => [
      label,
      ...cols.map((_, colIndex) => {
        const value = cell(cells[rowIndex]?.[colIndex]);
        if (value === "") return "";
        return marked.has(`${rowIndex}:${colIndex}`) ? `**${value}**` : value;
      }),
    ]);

    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [title ? `**${title}**` : "", table(head, body), caption ?? ""]
      .filter(Boolean)
      .join("\n\n");
  },
});
