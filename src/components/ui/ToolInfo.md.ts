import type { MarkdownContext, MdxNode } from "@utils/llms/mdx/types";
import { markdownFor } from "@utils/llms/mdx/types";

/**
 * The documentation half of a tool page — and the only component in the corpus
 * whose *children* are the problem rather than its props.
 *
 * The wrapper itself is a bare `<section>` for layout and carries nothing, so
 * it is unwrapped. What it contains is hand-written raw HTML: across the 34
 * tool files, 538 `<li>`, 504 `<code>`, 676 `<td>`, 345 headings, 28 tables and
 * one `<style>` block. MDX hands all of that to the renderer as
 * `mdxJsxFlowElement`/`mdxJsxTextElement` nodes with a lowercase `name`, and
 * the fail-safe path — a tag with no module contributes its children — flattens
 * every one of them. Before this module `/tools/csp-builder/` converted to a
 * wall of undifferentiated paragraphs: "About This Tool" and "Features" were
 * indistinguishable from body text, the six-item feature list read as six
 * unrelated paragraphs, and "How do I use this tool?" — the question the page
 * exists to answer — lost its heading and with it any chance of being a
 * retrieval chunk boundary.
 *
 * So this walks the HTML subtree itself. Not with a regex or an HTML parser:
 * the nodes are already in the mdast, and re-parsing sliced source would
 * reintroduce exactly the JSX-in-text ambiguity the renderer was built to
 * avoid. Three rules keep the walk honest:
 *
 *  - Anything that is NOT raw HTML is handed straight back to `ctx.render`, so
 *    the 144 fenced code blocks, 28 markdown links and 138 `<TerminalSession>`
 *    components inside these files keep their exact bytes and go through their
 *    own modules. This module never second-guesses another component.
 *  - A paragraph with no HTML in it is sliced, not rebuilt, so prose keeps the
 *    author's own line wrapping. Only the HTML-bearing blocks are normalized,
 *    and there whitespace is collapsed because a `<td>` that spans four source
 *    lines cannot survive as a table cell otherwise.
 *  - `<style>` and `<script>` are dropped outright rather than falling through
 *    to some generic container branch. A page-specific CSS grid is not content
 *    in any language, and the regex tester ships 90 lines of it.
 *
 * Deliberately discarded: `class` attributes and the layout `<div>`s that carry
 * them. They are the one place where a reader with a screen gets something a
 * reader without one cannot — the regex tester's flag cards put the flag letter
 * in a badge beside its description — but the alternative is hard-coding one
 * tool's CSS class names into a converter, and adjacency already preserves the
 * association. Colour, column widths and `content-visibility` follow the same
 * rule and are simply gone.
 */

/** Elements whose content is machinery for the page, never prose. */
const DROPPED = new Set(["style", "script", "template", "noscript", "link"]);

/** Elements that wrap blocks purely for layout: keep the children, drop the box. */
const TRANSPARENT = new Set([
  "div",
  "section",
  "article",
  "aside",
  "figure",
  "header",
  "footer",
  "main",
]);

/** HTML heading tags, mapped to the markdown depth they keep. */
const HEADINGS = new Map([
  ["h1", 1],
  ["h2", 2],
  ["h3", 3],
  ["h4", 4],
  ["h5", 5],
  ["h6", 6],
]);

/** Elements that start a block, used to decide how a paragraph is handled. */
const BLOCK_LEVEL = new Set([
  ...HEADINGS.keys(),
  ...TRANSPARENT,
  "p",
  "ul",
  "ol",
  "li",
  "table",
  "pre",
  "blockquote",
]);

/** Node types the MDX parser uses for `{…}` expressions. */
const EXPRESSION_TYPES = new Set(["mdxTextExpression", "mdxFlowExpression"]);

/** True for a JSX element node, flow or inline. */
function isElement(node: MdxNode): boolean {
  return node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement";
}

/**
 * True for a raw HTML tag as opposed to an imported component.
 *
 * MDX only distinguishes the two by case, which is also how Astro decides
 * whether to render an element or call a component, so the same test is the
 * correct one here.
 *
 * @param node - Any mdast node.
 * @returns Whether the node is a lowercase HTML element.
 */
function isHtml(node: MdxNode): boolean {
  return isElement(node) && /^[a-z]/u.test(node.name ?? "");
}

/**
 * The value of a `{…}` expression, when it is a plain string literal.
 *
 * These are not decoration: `<code>{"(?<name>...)"}</code>` is how the regex
 * tester writes a pattern that would otherwise be parsed as a tag, and
 * `<pre><code>{`…`}</code></pre>` is how the envelope visualizer writes two
 * whole pseudocode blocks. The renderer treats every expression as scaffolding
 * and drops it, so without this the code spans come out empty.
 *
 * Only a literal is accepted. A template with `${…}` in it is code to execute,
 * and this converter executes nothing.
 *
 * @param raw - Source text of the expression, without the braces.
 * @returns The string it denotes, or "" when it is not a plain literal.
 */
function literal(raw: string): string {
  const source = raw.trim();
  if (source.length < 2) return "";
  const first = source[0];
  const last = source.at(-1);
  if (first === "`" && last === "`") {
    return source.includes("${") ? "" : source.slice(1, -1);
  }
  if (first === '"' && last === '"') {
    try {
      return JSON.parse(source) as string;
    } catch {
      return source.slice(1, -1);
    }
  }
  if (first === "'" && last === "'") {
    return source.slice(1, -1).replaceAll(String.raw`\'`, "'");
  }
  return "";
}

/** Collapses every whitespace run — source line breaks included — to one space. */
function squash(text: string): string {
  return text.replaceAll(/\s+/gu, " ");
}

/** Every descendant matching a predicate, without entering a match's subtree. */
function collect(node: MdxNode, match: (n: MdxNode) => boolean): MdxNode[] {
  const found: MdxNode[] = [];
  const walk = (current: MdxNode) => {
    for (const child of current.children ?? []) {
      if (match(child)) found.push(child);
      else walk(child);
    }
  };
  walk(node);
  return found;
}

/** True when any descendant is JSX — an HTML tag, a component or an expression. */
function hasJsx(node: MdxNode): boolean {
  if (isElement(node) || EXPRESSION_TYPES.has(node.type)) return true;
  return (node.children ?? []).some((child) => hasJsx(child));
}

/** Verbatim text of a subtree, expressions included and nothing normalized. */
function rawText(node: MdxNode): string {
  if (node.type === "text" || node.type === "inlineCode")
    return node.value ?? "";
  if (node.type === "code") return node.value ?? "";
  if (EXPRESSION_TYPES.has(node.type)) return literal(node.value ?? "");
  return (node.children ?? []).map((child) => rawText(child)).join("");
}

/** Wraps text in an inline marker, keeping the markers tight to the content. */
function emphasize(inner: string, marker: string): string {
  const trimmed = inner.trim();
  if (trimmed === "") return "";
  const lead = inner.startsWith(" ") ? " " : "";
  const tail = inner.endsWith(" ") ? " " : "";
  return `${lead}${marker}${trimmed}${marker}${tail}`;
}

/** A code span with enough backticks to survive whatever it contains. */
function codeSpan(value: string): string {
  const runs = [...value.matchAll(/`+/gu)].map((m) => m[0].length);
  if (runs.length === 0) return `\`${value}\``;
  const ticks = "`".repeat(Math.max(...runs) + 1);
  const pad = value.startsWith("`") || value.endsWith("`") ? " " : "";
  return `${ticks}${pad}${value}${pad}${ticks}`;
}

/** A fenced block with a delimiter longer than any backtick run inside it. */
function fence(code: string): string {
  const runs = [...code.matchAll(/`+/gu)].map((m) => m[0].length);
  const ticks = "`".repeat(Math.max(3, ...runs.map((n) => n + 1)));
  return `${ticks}\n${code.replace(/\s+$/u, "")}\n${ticks}`;
}

/** Root-relative hrefs become absolute; anything else is left as authored. */
function absolute(href: string, siteUrl: string): string {
  return href.startsWith("/") ? `${siteUrl}${href}` : href;
}

/**
 * Markdown for a subtree that must end up on a single line.
 *
 * @param node - The node to flatten.
 * @param ctx - Renderer helpers.
 * @returns Inline markdown.
 */
function inline(node: MdxNode, ctx: MarkdownContext): string {
  const children = () =>
    (node.children ?? []).map((child) => inline(child, ctx)).join("");

  if (EXPRESSION_TYPES.has(node.type)) return squash(literal(node.value ?? ""));

  switch (node.type) {
    case "text": {
      return squash(node.value ?? "");
    }
    case "inlineCode": {
      return codeSpan(node.value ?? "");
    }
    case "strong": {
      return emphasize(children(), "**");
    }
    case "emphasis": {
      return emphasize(children(), "*");
    }
    case "break": {
      return " ";
    }
    // A paragraph inside an `<li>` or a `<td>` is mdast structure, not content.
    case "paragraph": {
      return children();
    }
    case "link": {
      const href = ctx.attr(node, "href") ?? "";
      return `[${children().trim()}](${absolute(href, ctx.siteUrl)})`;
    }
    default: {
      break;
    }
  }

  if (!isElement(node)) return squash(ctx.render(node));
  // A component used inline still belongs to its own module.
  if (!isHtml(node)) return squash(ctx.render(node)).trim();

  const name = node.name ?? "";
  if (DROPPED.has(name)) return "";

  switch (name) {
    case "strong":
    case "b": {
      return emphasize(children(), "**");
    }
    case "em":
    case "i": {
      return emphasize(children(), "*");
    }
    case "code": {
      const value = squash(rawText(node)).trim();
      return value === "" ? "" : codeSpan(value);
    }
    case "a": {
      const href = ctx.attr(node, "href");
      const text = children().trim();
      if (!href) return text;
      return `[${text === "" ? href : text}](${absolute(href, ctx.siteUrl)})`;
    }
    // `2<sup>64</sup>` is an exponent, and without the caret it reads as 264.
    case "sup": {
      return `^${children().trim()}`;
    }
    case "br": {
      return " ";
    }
    default: {
      return children();
    }
  }
}

/** Inline markdown for a node list, trimmed and with runs of spaces removed. */
function inlineAll(nodes: MdxNode[], ctx: MarkdownContext): string {
  let out = "";
  let previousEnd: number | undefined;
  for (const child of nodes) {
    const piece = inline(child, ctx);
    const start = child.position?.start.offset;
    // mdast drops the whitespace at the end of a paragraph, so a tag that sat
    // on the next source line arrives with nothing separating it from the text
    // before: "…, see" and "<a>" glue into "see[Implementing CSP…]". A gap
    // between the two source ranges IS that whitespace, and it is put back —
    // except before a closing punctuation mark, where the browser renders a
    // stray space the markdown has no reason to copy.
    if (
      piece !== "" &&
      out !== "" &&
      previousEnd !== undefined &&
      start !== undefined &&
      start > previousEnd &&
      !out.endsWith(" ") &&
      !piece.startsWith(" ") &&
      !/^[.,;:!?)](\s|$)/u.test(piece)
    ) {
      out += " ";
    }
    out += piece;
    previousEnd = child.position?.end.offset;
  }
  return squash(out).trim();
}

/**
 * Markdown for the contents of a container, preserving source bytes when it is
 * plain prose.
 *
 * @param nodes - The container's children.
 * @param ctx - Renderer helpers.
 * @returns Inline markdown.
 */
function contents(nodes: MdxNode[], ctx: MarkdownContext): string {
  // One prose paragraph and nothing else: slice it, so the author's own line
  // wrapping survives instead of being reflowed into one long line.
  if (
    nodes.length === 1 &&
    nodes[0].type === "paragraph" &&
    !hasJsx(nodes[0])
  ) {
    return ctx.render(nodes[0]).trim();
  }
  return inlineAll(nodes, ctx);
}

/** A `<ul>`/`<ol>` as a markdown list. */
function list(node: MdxNode, ctx: MarkdownContext, ordered: boolean): string {
  // Items reach here two ways: a multi-line `<li>` is a flow element and a
  // direct child, while a one-line `<li>` is absorbed into a paragraph. No tool
  // file nests one list inside another, so collecting every `li` descendant is
  // unambiguous.
  const items = collect(node, (n) => isHtml(n) && n.name === "li");
  const lines = items
    .map((item, index) => {
      const text = contents(item.children ?? [], ctx);
      if (text === "") return "";
      const marker = ordered ? `${index + 1}.` : "-";
      // Continuation lines are indented so a multi-line item stays one item.
      return `${marker} ${text.replaceAll("\n", "\n  ")}`;
    })
    .filter((line) => line !== "");
  return lines.join("\n");
}

/** One table row's cells, flattened to single-line markdown. */
function cells(row: MdxNode, ctx: MarkdownContext): string[] {
  return collect(row, (n) => isHtml(n) && (n.name === "td" || n.name === "th"))
    .map((cell) => inlineAll(cell.children ?? [], ctx))
    .map((text) => text.replaceAll("|", String.raw`\|`));
}

/** A `<table>` as a GitHub-flavoured markdown table. */
function table(node: MdxNode, ctx: MarkdownContext): string {
  const rows = collect(node, (n) => isHtml(n) && n.name === "tr").map(
    (row) => ({
      header: collect(row, (n) => isHtml(n) && n.name === "th").length > 0,
      values: cells(row, ctx),
    }),
  );
  if (rows.length === 0) return "";

  const width = Math.max(...rows.map((row) => row.values.length));
  const pad = (values: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => values[i] ?? "").join(" | ")} |`;

  // GFM has no table without a header row. Every table in the corpus has a
  // `<thead>`, but promoting the first row is a better failure than emitting a
  // block that no markdown parser will read as a table.
  const headerIndex = rows.findIndex((row) => row.header);
  const head = rows[headerIndex === -1 ? 0 : headerIndex];
  const body = rows.filter((row) => row !== head);

  return [
    pad(head.values),
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ...body.map((row) => pad(row.values)),
  ].join("\n");
}

/**
 * Markdown for one block-level node inside the documentation section.
 *
 * @param node - The node to convert.
 * @param ctx - Renderer helpers.
 * @returns Block markdown.
 */
function block(node: MdxNode, ctx: MarkdownContext): string {
  // A paragraph that holds an HTML tag is a container the parser invented, not
  // a paragraph: `<h3>Features</h3>` on its own line arrives wrapped in one.
  if (node.type === "paragraph") {
    const children = node.children ?? [];
    if (children.every((child) => !isHtml(child))) return ctx.render(node);
    return children.some(
      (child) => isHtml(child) && BLOCK_LEVEL.has(child.name ?? ""),
    )
      ? blocks(children, ctx)
      : inlineAll(children, ctx);
  }

  // Fences, markdown lists, thematic breaks and every real component: their own
  // bytes, or their own module.
  if (!isHtml(node)) return ctx.render(node);

  const name = node.name ?? "";
  if (DROPPED.has(name)) return "";

  const depth = HEADINGS.get(name);
  if (depth !== undefined) {
    const text = inlineAll(node.children ?? [], ctx);
    return text === "" ? "" : ctx.heading(depth, text);
  }

  switch (name) {
    case "ul": {
      return list(node, ctx, false);
    }
    case "ol": {
      return list(node, ctx, true);
    }
    case "table": {
      return table(node, ctx);
    }
    case "pre": {
      return fence(rawText(node));
    }
    case "li": {
      // A stray item outside any list; still an item.
      const text = contents(node.children ?? [], ctx);
      return text === "" ? "" : `- ${text}`;
    }
    case "p": {
      return contents(node.children ?? [], ctx);
    }
    case "blockquote": {
      const text = contents(node.children ?? [], ctx);
      return text === "" ? "" : `> ${text.replaceAll("\n", "\n> ")}`;
    }
    default: {
      if (TRANSPARENT.has(name)) return blocks(node.children ?? [], ctx);
      // Something inline standing alone: a lone `<code>` or `<a>` on its line.
      return inline(node, ctx).trim();
    }
  }
}

/** Block markdown for a node list, blank-line separated. */
function blocks(nodes: MdxNode[], ctx: MarkdownContext): string {
  return nodes
    .map((child) => block(child, ctx).trim())
    .filter((text) => text !== "")
    .join("\n\n");
}

export default markdownFor({
  tag: "ToolInfo",
  toMarkdown(node, ctx) {
    // Headings keep the depth the author wrote — the section opens at `<h2>` —
    // and `ctx.heading` shifts them by whatever offset the caller asked for.
    // Fitting them under the heading the corpus builder puts above the tool is
    // that builder's job: `llms.ts` nests this body under a `###` and passes
    // `headingOffset: 2`. Guessing a depth here would fight it.
    return blocks(node.children ?? [], ctx);
  },
});
