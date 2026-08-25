import { markdownFor } from "@utils/llms/mdx/types";

/**
 * Before/after metric bars. The props carry only `before` and `after`; the
 * delta, the percentage and — crucially — *whether the change is an
 * improvement* are computed by the component and shown as a colored arrow.
 * Color and arrows are exactly the part a reader without a screen loses, so
 * this module recomputes all three and spells the verdict out as a word.
 *
 * The arithmetic is the component's own: `diff = after − before`,
 * `pct = diff / before` (zero when `before` is 0), and
 * `lowerIsBetter` (default `true`) decides which sign counts as better.
 * Kept in step with `DeltaCompare.astro` — if the formula there changes, this
 * changes with it.
 *
 * Column headers reuse the component's own screen-reader table wording
 * (`deltaCompare.srMetric` and friends), copied here rather than imported
 * because these modules keep their visible strings local.
 *
 * Numbers stay in plain ASCII rather than the page's locale formatting: the
 * Spanish rendering of 1,365 is `1.365`, which reads as "one" to a parser.
 *
 * Dropped on purpose: the bar widths (a per-row rescaling of the same two
 * numbers) and `ariaLabel`, which paraphrases in prose the very rows the
 * table now states outright.
 */
const HEAD = {
  en: {
    metric: "Metric",
    before: "Before",
    after: "After",
    change: "Change",
    good: "better",
    bad: "worse",
    same: "unchanged",
  },
  es: {
    metric: "Métrica",
    before: "Antes",
    after: "Después",
    change: "Cambio",
    good: "mejor",
    bad: "peor",
    same: "sin cambio",
  },
} as const;

interface Row {
  label?: string;
  before?: number;
  after?: number;
  lowerIsBetter?: boolean;
}

/** Anything a table cell can hold once the props have been read. */
type CellValue = string | number | undefined;

/** Markdown table cell: newlines flattened, pipes escaped. */
const cell = (value: CellValue): string =>
  String(value ?? "")
    .replaceAll(/\s*\n\s*/gu, " ")
    .replaceAll("|", String.raw`\|`)
    .trim();

/** A markdown table from a header row and body rows. */
const table = (head: string[], body: CellValue[][]): string =>
  [
    `| ${head.map(cell).join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ].join("\n");

/** Signed number with an explicit `+`, matching the component's badge. */
const signed = (value: number): string =>
  value > 0 ? `+${value}` : String(value);

export default markdownFor({
  tag: "DeltaCompare",
  toMarkdown(node, ctx) {
    const rows = ctx.expr<Row[]>(node, "rows");
    if (!Array.isArray(rows) || rows.length === 0) return ctx.body(node);

    const head = HEAD[ctx.locale];
    const unit = ctx.attr(node, "unit") ?? "";

    const body = rows.map((row) => {
      const before = row?.before ?? 0;
      const after = row?.after ?? 0;
      const diff = after - before;
      const percent = before === 0 ? 0 : (diff / before) * 100;
      const lowerIsBetter = row?.lowerIsBetter ?? true;
      const better = lowerIsBetter ? diff < 0 : diff > 0;
      let verdict: string = head.same;
      if (diff !== 0) verdict = better ? head.good : head.bad;
      const rounded = Math.round(percent * 10) / 10;
      return [
        row?.label,
        `${before}${unit}`,
        `${after}${unit}`,
        `${signed(diff)}${unit} (${signed(rounded)}%) — ${verdict}`,
      ];
    });

    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [
      title ? `**${title}**` : "",
      table([head.metric, head.before, head.after, head.change], body),
      caption ?? "",
    ]
      .filter(Boolean)
      .join("\n\n");
  },
});
