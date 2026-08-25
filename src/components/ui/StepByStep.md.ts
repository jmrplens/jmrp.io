import {
  type MarkdownContext,
  markdownFor,
  type MdxNode,
} from "@utils/llms/mdx/types";

/**
 * The steps are raw `<li>` inside an `<ol>` whose numbers come from a CSS
 * counter, so the source contains no digit anywhere: dropping the tag would
 * publish an unordered pile of paragraphs in which "then", "next" and
 * "finally" have nothing to count from. This is the one component in the group
 * whose markdown ADDS a fact — the ordinal — rather than relabelling one.
 *
 * A real ordered list is used rather than `**Step 1**` headings because most
 * steps already open with a bold lead-in of their own, and a second bold line
 * above it would read as two titles.
 *
 * Kept: the title, every step, in order, with its code blocks and nested
 * lists. Dropped: nothing — the component has no other props.
 */

/** mdast types that sit inside a paragraph rather than beside it. */
const PHRASING = new Set([
  "text",
  "inlineCode",
  "strong",
  "emphasis",
  "delete",
  "link",
  "image",
  "break",
  "html",
  "footnoteReference",
  "mdxJsxTextElement",
  "mdxTextExpression",
]);

/** Every `<li>` in the subtree, in document order. */
function steps(node: MdxNode): MdxNode[] {
  const found: MdxNode[] = [];
  const walk = (current: MdxNode) => {
    for (const child of current.children ?? []) {
      if (child.name === "li") found.push(child);
      else walk(child);
    }
  };
  walk(node);
  return found;
}

/**
 * Body of one step.
 *
 * A step written on one line (post 010) has phrasing children, and `ctx.body()`
 * would separate them with blank lines because the renderer only joins text,
 * inline code and JSX edge to edge — `strong` is not on that list. Those are
 * re-joined here, reading each `text` node from its own value: the renderer
 * strips indentation from a slice, which eats the space between two bold runs.
 *
 * @param node - The `<li>` element.
 * @param ctx - Renderer helpers.
 * @returns The step body as markdown.
 */
function stepBody(node: MdxNode, ctx: MarkdownContext): string {
  const children = node.children ?? [];
  if (children.some((c) => !PHRASING.has(c.type))) return ctx.body(node);
  return children
    .map((c) => (c.type === "text" ? (c.value ?? "") : ctx.render(c)))
    .join("")
    .replaceAll(/\n[ \t]+/gu, "\n")
    .trim();
}

export default markdownFor({
  tag: "StepByStep",
  toMarkdown(node, ctx) {
    const list = steps(node);
    if (list.length === 0) return ctx.body(node);

    const numbered = list.map((step, index) => {
      const marker = `${index + 1}. `;
      // Everything under the first line is indented to the marker's width, so
      // a fenced block or a sub-list inside a step stays inside the step.
      const pad = " ".repeat(marker.length);
      const body = stepBody(step, ctx)
        .split("\n")
        .map((line, n) => (n === 0 || line === "" ? line : pad + line))
        .join("\n");
      return marker + body;
    });

    const title = ctx.attr(node, "title");
    return (title ? `**${title}**\n\n` : "") + numbered.join("\n\n");
  },
});
