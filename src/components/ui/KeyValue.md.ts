import { table } from "@utils/llms/mdx/markdown-table";
import { markdownFor } from "@utils/llms/mdx/types";

/**
 * A `<dl>` of configuration keys, each with a short value and a longer gloss.
 * The three fields become three columns, because the association
 * key → value → gloss IS the content: a flat list of the values alone would
 * publish `0.0.0.0:9001` with nothing saying which directive it belongs to.
 *
 * Column headers are invented here — the page has none, it is a definition
 * list — so they are named after the props (`key`, `value`, `description`)
 * rather than after anything the reader sees.
 *
 * Dropped on purpose:
 * - the `<code>` wrapper around every value. It is presentational (the CSS
 *   calls the block a "flat mono ledger") and half the values are prose
 *   — "Onion Router Port (IPv4)" — so backticks would assert a literal the
 *   source never claims.
 * - `headingLevel`. It only chooses which of h3…h6 renders the title; the
 *   title becomes a bold lead-in like everywhere else in this converter, so
 *   promoting it to a real heading would fragment the post's outline.
 */
const HEAD = {
  en: { key: "Key", value: "Value", description: "Description" },
  es: { key: "Clave", value: "Valor", description: "Descripción" },
} as const;

interface Item {
  key?: string;
  value?: string;
  description?: string;
}

export default markdownFor({
  tag: "KeyValue",
  toMarkdown(node, ctx) {
    const items = ctx.expr<Item[]>(node, "items");
    if (!Array.isArray(items) || items.length === 0) return ctx.body(node);

    const head = HEAD[ctx.locale];
    // The description column is dropped when no item has one, so a two-field
    // ledger does not carry an empty third column down every row.
    const described = items.some((item) => item?.description);
    const columns = described
      ? [head.key, head.value, head.description]
      : [head.key, head.value];
    const rows = items.map((item) =>
      described
        ? [item?.key, item?.value, item?.description]
        : [item?.key, item?.value],
    );

    const title = ctx.attr(node, "title");
    const heading = title ? `**${title}**\n\n` : "";
    return `${heading}${table(columns, rows)}`;
  },
});
