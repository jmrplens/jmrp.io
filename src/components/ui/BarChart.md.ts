import { table } from "@utils/llms/mdx/markdown-table";
import { markdownFor } from "@utils/llms/mdx/types";

/**
 * A horizontal bar chart of real statistics. The bars are the only thing on
 * the page that carries the comparison, and a reader with no screen gets
 * nothing from them, so the series becomes a table: label, value, and the
 * share of the total the chart prints next to each bar.
 *
 * The share column mirrors what the page shows, so it honours
 * `showPercentage` (default `true`). The value column does not honour
 * `showValue`: hiding a number is a decision about a *picture*, and the
 * number is still the datum the chart was built from.
 *
 * Dropped on purpose:
 * - `colorScheme`, `semanticColors` and per-bar `color`. Okabe-Ito versus
 *   ColorBrewer is a colorblind-safety choice about pixels; it says nothing
 *   about the data.
 * - `maxValue`. It only rescales the bar lengths — the values are unchanged.
 * - `ariaLabel`. It is a one-line paraphrase written for a reader who cannot
 *   see the chart ("Bar chart showing distribution of port scan attempts");
 *   that reader now has the numbers themselves.
 *
 * The "% of total" header is the component's own `barChart.ofTotal` wording,
 * copied rather than imported: these modules keep their visible strings local.
 * Numbers stay in plain ASCII rather than the page's locale formatting — a
 * Spanish `42,1` reads as forty-two in most parsers, and `1.365` as one.
 */
const HEAD = {
  en: { item: "Item", value: "Value", share: "% of total" },
  es: { item: "Elemento", value: "Valor", share: "% del total" },
} as const;

interface Bar {
  label?: string;
  value?: number;
}

export default markdownFor({
  tag: "BarChart",
  toMarkdown(node, ctx) {
    const data = ctx.expr<Bar[]>(node, "data");
    if (!Array.isArray(data) || data.length === 0) return ctx.body(node);

    const head = HEAD[ctx.locale];
    const unit = ctx.attr(node, "valueUnit") ?? "";
    const total = data.reduce((sum, bar) => sum + (bar?.value ?? 0), 0);
    // `showPercentage` defaults to true, and a share of zero is meaningless.
    const share =
      ctx.expr<boolean>(node, "showPercentage") !== false && total > 0;

    const columns = share
      ? [head.item, head.value, head.share]
      : [head.item, head.value];
    const rows = data.map((bar) => {
      const value = `${bar?.value ?? ""}${unit}`;
      if (!share) return [bar?.label, value];
      const percent = ((bar?.value ?? 0) / total) * 100;
      return [bar?.label, value, `${Math.round(percent * 10) / 10}%`];
    });

    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [title ? `**${title}**` : "", table(columns, rows), caption ?? ""]
      .filter(Boolean)
      .join("\n\n");
  },
});
