import { markdownFor } from "@utils/llms/mdx/types";

/**
 * "How big is the secret vs how fast can the attacker guess." Two magnitudes
 * and a verdict — and on the page the two numbers carry no units of their
 * own: one is a count of combinations, the other a rate, and only the layout
 * says which is which. The table names them, and appends the unit the
 * component prints (`/s`) or implies (combinations), because `10000` and
 * `11160000` side by side are otherwise two numbers with no relation.
 *
 * `verdictTone` is colour-only styling — red when the attacker wins, green
 * when the defender holds — so it becomes a word next to the verdict.
 *
 * Dropped on purpose:
 * - the logarithmic bar widths. They exist so a keyspace a thousand times
 *   smaller than the throughput is still visible on a screen; they add no
 *   fact to the two numbers.
 * - `ariaLabel`, which restates the same two numbers and the same verdict in
 *   prose for a reader who cannot see the figure.
 *
 * The headers and `guesses/s` are the component's own `keyspaceThreat.*`
 * wording, copied rather than imported: these modules keep their strings
 * local. Numbers stay in plain ASCII — the page's Spanish `11.160.000` reads
 * as eleven-point-one to a parser.
 */
const LABEL = {
  en: {
    quantity: "Quantity",
    value: "Value",
    note: "Note",
    verdict: "Verdict",
    perSecond: "guesses/s",
    combinations: "combinations",
    bad: "the attacker wins",
    good: "the defender holds",
  },
  es: {
    quantity: "Magnitud",
    value: "Valor",
    note: "Nota",
    verdict: "Veredicto",
    perSecond: "intentos/s",
    combinations: "combinaciones",
    bad: "gana el atacante",
    good: "aguanta la defensa",
  },
} as const;

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

export default markdownFor({
  tag: "KeyspaceThreat",
  toMarkdown(node, ctx) {
    const keyspace = ctx.expr<number>(node, "keyspace");
    const throughput = ctx.expr<number>(node, "throughput");
    if (typeof keyspace !== "number" || typeof throughput !== "number") {
      return ctx.body(node);
    }

    const label = LABEL[ctx.locale];
    const body = [
      [
        ctx.attr(node, "secretLabel"),
        `${keyspace} ${label.combinations}`,
        ctx.attr(node, "keyspaceNote"),
      ],
      [
        ctx.attr(node, "throughputLabel"),
        `${throughput} ${label.perSecond}`,
        ctx.attr(node, "throughputNote"),
      ],
    ];

    const tone = ctx.attr(node, "verdictTone") === "good" ? "good" : "bad";
    const verdict = ctx.attr(node, "verdict");
    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [
      title ? `**${title}**` : "",
      table([label.quantity, label.value, label.note], body),
      verdict ? `**${label.verdict} (${label[tone]}):** ${verdict}` : "",
      caption ?? "",
    ]
      .filter(Boolean)
      .join("\n\n");
  },
});
