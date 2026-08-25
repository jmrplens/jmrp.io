import {
  type MarkdownContext,
  markdownFor,
  type MdxNode,
} from "@utils/llms/mdx/types";

/**
 * `<Table>` is the one component that receives no structured data: the author
 * writes raw `<thead>`/`<tbody>`/`<tr>`/`<td>` inside the MDX and the component
 * only styles it. The parser hands that back as lowercase JSX nodes, so the
 * grid is rebuilt from the AST and emitted as a real markdown table.
 *
 * Falling back to the children — what an unregistered component does — is
 * unusually destructive here: every cell of all 142 tables would arrive as a
 * blank-line-separated run of loose phrases with no hint of which column each
 * one belonged to. This is 12.3% of the corpus.
 *
 * KEPT: the `title`, the header row, every cell with its inline markup
 * (`<code>`, `<strong>`, links, `<sup>`), the polarity of `data-status`, and
 * the values a `rowspan` covers.
 *
 * DROPPED ON PURPOSE: `striped`/`compact`/`highlight`/`bordered`/`class` (pure
 * presentation), `id` (a test hook), `ariaLabel` (the component only emits it
 * when there is no `title`, and all 142 have one), and `th scope` (position in
 * the emitted table already says which axis a header labels).
 */

/**
 * `data-status` is NOT recoverable from the cell text, which is why it is
 * emitted rather than dropped as decoration: the corpus contains both
 * `success: "No"` and `error: "Yes"` — in a table of vulnerabilities "Yes" is
 * the bad answer, in a table of features it is the good one. A model reading
 * the text alone would get the polarity of those rows exactly backwards.
 * An unknown status falls through to its own name rather than being lost.
 */
const STATUS: Record<string, Record<string, string>> = {
  en: { success: "good", error: "bad", warning: "caution", info: "note" },
  es: { success: "bien", error: "mal", warning: "cuidado", info: "nota" },
};

const SECTION_TAGS = new Set(["thead", "tbody", "tfoot"]);
const ROW_TAGS = new Set(["tr"]);
const CELL_TAGS = new Set(["td", "th"]);

/** One cell, already flattened to a single line of markdown. */
interface Cell {
  text: string;
  colspan: number;
  rowspan: number;
}

/** mdast keeps a link's destination outside the fields `MdxNode` declares. */
interface LinkFields {
  url?: string;
}

/**
 * Descendant elements named in `names`, without entering a match.
 *
 * A plain `children` filter is not enough: MDX wraps the cells of a `<tr>` in
 * a `paragraph` node, so `<td>` is a grandchild of its row, not a child.
 *
 * @param node - Subtree to search.
 * @param names - Tag names to collect.
 * @returns The matches, in document order.
 */
function descend(node: MdxNode, names: Set<string>): MdxNode[] {
  const found: MdxNode[] = [];
  const walk = (current: MdxNode) => {
    for (const child of current.children ?? []) {
      if (child.name && names.has(child.name)) found.push(child);
      else walk(child);
    }
  };
  walk(node);
  return found;
}

/** A newline inside a cell ends the row, so every run of space becomes one. */
function flatten(text: string): string {
  return text.replaceAll(/\s+/gu, " ");
}

/** GFM offers no way to carry a literal `|` in a cell, code spans included. */
function escapePipes(text: string): string {
  return text.replaceAll("|", String.raw`\|`);
}

/**
 * Wraps a value in as many backticks as it takes to contain its own runs.
 *
 * No cell in the corpus holds a backtick today; the counting is what keeps a
 * future one from silently splitting the row it lives in.
 *
 * @param value - Raw code text.
 * @returns A markdown code span.
 */
function codeSpan(value: string): string {
  const longest = value
    .matchAll(/`+/gu)
    .reduce((n, match) => Math.max(n, match[0].length), 0);
  const fence = "`".repeat(longest + 1);
  const pad = value.startsWith("`") || value.endsWith("`") ? " " : "";
  return `${fence}${pad}${value}${pad}${fence}`;
}

/**
 * Unwraps a JSX string expression, as in `<code>{"* , - /"}</code>`.
 *
 * The author wraps those values in an expression so MDX does not read `{` or
 * `*` as syntax. The renderer treats every expression as page scaffolding and
 * drops it, which would leave 52 empty code spans — the cron field syntax and
 * the Nginx location modifiers among them. Only a quoted literal is accepted;
 * anything else stays dropped.
 *
 * @param source - Raw expression source, braces already excluded.
 * @returns The string, or "" when the expression is not a string literal.
 */
function literal(source: string): string {
  const text = source.trim();
  const quote = text[0];
  if (
    text.length < 2 ||
    (quote !== '"' && quote !== "'") ||
    !text.endsWith(quote)
  ) {
    return "";
  }
  if (quote !== '"') return text.slice(1, -1);
  try {
    return JSON.parse(text) as string;
  } catch {
    return text.slice(1, -1);
  }
}

/**
 * Visible text of a subtree, expressions resolved.
 *
 * `ctx.text()` would do, except that it cannot see inside a JSX expression,
 * and 52 of the `<code>` cells in these tables are written as one.
 *
 * @param node - Subtree.
 * @returns Plain text.
 */
function rawText(node: MdxNode): string {
  if (["text", "inlineCode", "code"].includes(node.type))
    return node.value ?? "";
  if (["mdxFlowExpression", "mdxTextExpression"].includes(node.type)) {
    return literal(node.value ?? "");
  }
  return (node.children ?? []).map((child) => rawText(child)).join("");
}

/**
 * One inline node as markdown, on a single line.
 *
 * @param node - The node.
 * @param ctx - Renderer helpers.
 * @returns Markdown.
 */
function inline(node: MdxNode, ctx: MarkdownContext): string {
  switch (node.type) {
    case "text": {
      return escapePipes(flatten(node.value ?? ""));
    }
    // `code` is a fenced block, which cannot survive inside a cell. None
    // appears today; if one does, a flattened code span beats losing it.
    case "code":
    case "inlineCode": {
      return codeSpan(escapePipes(flatten(node.value ?? "")));
    }
    case "strong": {
      return `**${children(node, ctx)}**`;
    }
    case "emphasis": {
      return `*${children(node, ctx)}*`;
    }
    case "link": {
      const { url } = node as MdxNode & LinkFields;
      const text = children(node, ctx);
      return url ? `[${text}](${escapePipes(url)})` : text;
    }
    case "mdxFlowExpression":
    case "mdxTextExpression": {
      return escapePipes(flatten(literal(node.value ?? "")));
    }
    case "mdxJsxFlowElement":
    case "mdxJsxTextElement": {
      return element(node, ctx);
    }
    default: {
      return children(node, ctx);
    }
  }
}

/**
 * One JSX element inside a cell.
 *
 * The tags handled here are the HTML the author wrote by hand. Anything else —
 * including a component, which no cell contains today — contributes its
 * children and never its own syntax, the same fail-safe the renderer applies.
 *
 * @param node - The element.
 * @param ctx - Renderer helpers.
 * @returns Markdown.
 */
function element(node: MdxNode, ctx: MarkdownContext): string {
  const inner = children(node, ctx);
  switch (node.name) {
    case "code": {
      return codeSpan(escapePipes(flatten(rawText(node))));
    }
    case "strong":
    case "b": {
      return inner && `**${inner}**`;
    }
    case "em":
    case "i": {
      return inner && `*${inner}*`;
    }
    case "a": {
      const href = ctx.attr(node, "href");
      return href ? `[${inner}](${escapePipes(href)})` : inner;
    }
    case "sup": {
      // `2<sup>64</sup>` flattened to its children reads as "264", an outright
      // falsehood rather than a loss. The caret is the notation a model knows.
      return `^${inner}`;
    }
    case "br": {
      return " ";
    }
    default: {
      return inner;
    }
  }
}

/**
 * Children of a node, concatenated inline.
 *
 * @param node - The parent.
 * @param ctx - Renderer helpers.
 * @returns Markdown.
 */
function children(node: MdxNode, ctx: MarkdownContext): string {
  return (node.children ?? []).map((child) => inline(child, ctx)).join("");
}

/**
 * Reads a span attribute.
 *
 * @param node - The cell.
 * @param name - `colspan` or `rowspan`.
 * @param ctx - Renderer helpers.
 * @returns The span, at least 1.
 */
function span(node: MdxNode, name: string, ctx: MarkdownContext): number {
  const value = Number.parseInt(ctx.attr(node, name) ?? "", 10);
  return Number.isFinite(value) && value > 1 ? value : 1;
}

/**
 * One cell: its markdown, its spans and its status marker.
 *
 * @param node - A `<td>` or `<th>`.
 * @param ctx - Renderer helpers.
 * @returns The cell.
 */
function readCell(node: MdxNode, ctx: MarkdownContext): Cell {
  const text = flatten(children(node, ctx)).trim();
  const status = ctx.attr(node, "data-status");
  const label = status ? (STATUS[ctx.locale][status] ?? status) : undefined;
  return {
    text: label ? `${text} [${label}]`.trim() : text,
    colspan: span(node, "colspan", ctx),
    rowspan: span(node, "rowspan", ctx),
  };
}

/**
 * Resolves `colspan`/`rowspan` into a rectangular grid.
 *
 * `rowspan` is the case that cannot be ignored: the rows it covers carry one
 * cell fewer, so emitting them as written would slide every value one column
 * to the left — post 004 would claim "Connection ID" is a packet section. The
 * covered cells are filled with the spanning value instead, which is what the
 * table means and what the page shows.
 *
 * @param rows - Cells per source row.
 * @returns Cell text per grid row.
 */
function layout(rows: Cell[][]): string[][] {
  const grid: string[][] = [];
  /** Column → text a `rowspan` above still owes it, and for how many rows. */
  const held = new Map<number, { text: string; rows: number }>();

  for (const cells of rows) {
    const out: string[] = [];
    let column = 0;
    const drain = () => {
      for (let hold = held.get(column); hold; hold = held.get(column)) {
        out[column] = hold.text;
        hold.rows -= 1;
        if (hold.rows === 0) held.delete(column);
        column += 1;
      }
    };

    for (const cell of cells) {
      drain();
      for (let index = 0; index < cell.colspan; index += 1) {
        // Only the first column of a `colspan` keeps the text: these are
        // full-width section headings ("[ v3_ca ] — For the Root CA"), and
        // repeating one across three columns would read as three data points.
        const text = index === 0 ? cell.text : "";
        out[column] = text;
        if (cell.rowspan > 1) {
          held.set(column, { text, rows: cell.rowspan - 1 });
        }
        column += 1;
      }
    }
    drain();
    grid.push(out);
  }
  return grid;
}

export default markdownFor({
  // The bare `<table>`, not just the component: the tools MDX writes 28 tables
  // as plain HTML, and they reach the very same fail-safe — a heap of cells
  // with no columns. One grid builder serves both.
  tag: ["Table", "table"],
  toMarkdown(node, ctx) {
    const sections = descend(node, SECTION_TAGS);
    const source = sections.length > 0 ? sections : [node];
    const rows = source
      .flatMap((section) => descend(section, ROW_TAGS))
      .map((row) => descend(row, CELL_TAGS).map((cell) => readCell(cell, ctx)));

    const grid = layout(rows);
    const [header, ...body] = grid;
    // Fail safe: a table shape this renderer cannot read keeps its content.
    if (!header || header.length === 0) return ctx.body(node);

    const width = grid.reduce((n, row) => Math.max(n, row.length), 0);
    const line = (cells: string[]) =>
      `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;

    const title = ctx.attr(node, "title");
    const caption = title ? `**${title}**\n\n` : "";
    // Every table in the corpus has exactly one `<thead>` row, and a table
    // written without sections still puts its header first, so the first row
    // is the header either way. Extra header rows fall into the body, which is
    // the only place markdown can put them.
    return [
      caption + line(header),
      `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
      ...body.map((row) => line(row)),
    ].join("\n");
  },
});
