/**
 * Markdown table primitives shared by the component markdown modules.
 *
 * Ten modules had grown an identical private copy of these helpers, which is
 * how one regex ended up flagged eleven times. The old pattern put a starred
 * whitespace class on BOTH sides of a newline, and since that class matches a
 * newline too, a run of blank lines can be split between the three parts in
 * many ways — super-linear backtracking on input the author controls. One
 * whitespace class with a plus collapses the same runs in a single pass with
 * no ambiguity, and inside a table cell the extra collapsing of repeated
 * spaces is wanted anyway.
 *
 * @module
 */

/** What a component prop can hold for one cell. */
export type CellValue = string | number | boolean | null | undefined;

/**
 * One table cell: whitespace flattened to single spaces, pipes escaped.
 *
 * A newline inside a cell ends the row in markdown and an unescaped pipe
 * starts a new column, so both are structural and neither survives as-is.
 *
 * @param value - The raw prop value.
 * @returns The cell text.
 */
export function cell(value: CellValue): string {
  return String(value ?? "")
    .replaceAll(/\s+/gu, " ")
    .replaceAll("|", String.raw`\|`)
    .trim();
}

/**
 * A markdown table from a header row and body rows.
 *
 * @param head - Header labels.
 * @param body - Rows, each the same length as `head`.
 * @returns The table, without a trailing newline.
 */
export function table(head: string[], body: CellValue[][]): string {
  return [
    `| ${head.map(cell).join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ].join("\n");
}

/**
 * Collapses a value to a single line, for use inside a bullet.
 *
 * Same flattening as {@link cell} without the pipe escaping, which outside a
 * table would only show the reader a stray backslash.
 *
 * @param value - The raw prop value.
 * @returns One line of text.
 */
export function line(value: string | undefined): string {
  return (value ?? "").replaceAll(/\s+/gu, " ").trim();
}
