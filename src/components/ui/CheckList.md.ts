import {
  type MarkdownContext,
  markdownFor,
  type MdxNode,
} from "@utils/llms/mdx/types";

/**
 * A checklist is a `<ul>` of raw `<li data-check="…">`, and the marker is half
 * the meaning: the same sentence under `check` and under `cross` says opposite
 * things. The page draws ✓ ✕ ⚠ ○ from CSS `content`, so none of it survives
 * into the text — the state is written out here instead.
 *
 * `check` is deliberately NOT labelled. The component styles a bare `<li>` and
 * a `check` one identically, so `check` is the unmarked baseline of the list,
 * and the title above it ("Strict CSP Requirements") already says what that
 * baseline means. Labelling 80 % of the items would bury the three states that
 * do carry something the prose does not.
 *
 * Kept: the title, every item, the three marked states. Dropped: nothing else —
 * the component has no other props.
 */
const MARKER = {
  en: { cross: "No", warning: "Warning", optional: "Optional" },
  es: { cross: "No", warning: "Advertencia", optional: "Opcional" },
} as const;

type MarkedState = keyof (typeof MARKER)["en"];

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

/** Every `<li>` in the subtree — they arrive wrapped in a paragraph. */
function items(node: MdxNode): MdxNode[] {
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
 * One child of an `<li>`, rendered.
 *
 * A `text` node is read from its own value rather than through `ctx.render()`:
 * the renderer strips indentation from whatever it slices, which eats the
 * leading space of the " or " between two bold runs and welds them together.
 *
 * Raw inline `<code>` — how post 008 writes its checklists — has no module of
 * its own, so the renderer hands back the bare text and the reader loses the
 * "this is a literal" cue. The backticks put it back.
 */
function child(node: MdxNode, ctx: MarkdownContext): string {
  if (node.type === "text") return node.value ?? "";
  if (node.type === "mdxJsxTextElement" && node.name === "code") {
    return `\`${ctx.text(node)}\``;
  }
  return ctx.render(node);
}

/**
 * Text of one `<li>`.
 *
 * `ctx.body()` is wrong for the one-line form: the renderer separates a
 * component's children with a blank line unless EVERY child is text, inline
 * code or JSX, and `strong` is not on that list — so `<li>Uses **nonces**
 * instead</li>` would come back as three paragraphs. Phrasing children are
 * re-joined edge to edge here, which reproduces the source exactly because each
 * one is emitted by slicing it.
 *
 * @param node - The `<li>` element.
 * @param ctx - Renderer helpers.
 * @returns The item text, as one markdown block.
 */
function itemText(node: MdxNode, ctx: MarkdownContext): string {
  const children = node.children ?? [];
  if (children.some((c) => !PHRASING.has(c.type))) return ctx.body(node);
  return children
    .map((c) => child(c, ctx))
    .join("")
    .replaceAll(/\n[ \t]+/gu, "\n")
    .trim();
}

export default markdownFor({
  tag: "CheckList",
  toMarkdown(node, ctx) {
    const list = items(node);
    if (list.length === 0) return ctx.body(node);

    const bullets = list.map((item) => {
      const state = ctx.attr(item, "data-check");
      const label =
        state && state in MARKER.en
          ? MARKER[ctx.locale][state as MarkedState]
          : undefined;
      const text = itemText(item, ctx);
      const line = label ? `**${label}** — ${text}` : text;
      // Continuation lines belong to the bullet, not beside it.
      return `- ${line.replaceAll("\n", "\n  ")}`;
    });

    const title = ctx.attr(node, "title");
    return (title ? `**${title}**\n\n` : "") + bullets.join("\n");
  },
});
