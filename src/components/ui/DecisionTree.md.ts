import {
  type MarkdownContext,
  markdownFor,
  type MdxNode,
} from "@utils/llms/mdx/types";

/**
 * A question plus a list of `<details>` branches: each `<summary>` is the
 * condition, and the body it hides is the advice for that condition. Left to
 * the fail-safe, the summary flattens into a paragraph and becomes
 * indistinguishable from the advice under it — "Tor fails to bootstrap"
 * stops being a symptom and reads as a statement of fact.
 *
 * So each branch is emitted as `If: <condition>` followed by its body, which
 * is the conditional the widget encodes and the form a model can actually act
 * on. "Collapsed" is discarded: it has no meaning without a viewport, and the
 * bodies hold real content (fenced commands, `TerminalCommand` blocks).
 *
 * The branches are raw HTML in the MDX, so they arrive as elements named
 * `details` / `summary` in lower case and are walked here rather than handled
 * by a module of their own — a `details.md.ts` would capture every `<details>`
 * on the site, including the ones that are not decision branches.
 */
const IF = { en: "If", es: "Si" } as const;

/** First `<summary>` in a subtree, wherever the parser put it. */
function findSummary(node: MdxNode): MdxNode | undefined {
  if (node.name === "summary") return node;
  for (const child of node.children ?? []) {
    const found = findSummary(child);
    if (found) return found;
  }
  return undefined;
}

/**
 * Splits one `<details>` branch into its condition and its body.
 *
 * `<summary>` sits on the line straight after `<details>` with no blank line,
 * so remark reads it as INLINE content and hands it over wrapped in a
 * paragraph. Matching on the direct children alone finds nothing and silently
 * drops the condition, which is the whole point of the branch — hence the
 * search, and hence unwrapping the block it is in.
 *
 * @param details - The `<details>` element node.
 * @param ctx - Renderer context.
 * @returns The summary node, if found, and the rendered body blocks.
 */
function splitBranch(
  details: MdxNode,
  ctx: MarkdownContext,
): { summary: MdxNode | undefined; branch: string[] } {
  const branch: string[] = [];
  let summary: MdxNode | undefined;
  for (const block of details.children ?? []) {
    const found = summary ? undefined : findSummary(block);
    if (found) {
      summary = found;
      const rest = (block === found ? [] : (block.children ?? []))
        .filter((sibling) => sibling !== found)
        .map((sibling) => ctx.render(sibling))
        .join("")
        .trim();
      if (rest) branch.push(rest);
      continue;
    }
    const rendered = ctx.render(block);
    if (rendered.trim() !== "") branch.push(rendered);
  }
  return { summary, branch };
}

export default markdownFor({
  tag: "DecisionTree",
  toMarkdown(node, ctx) {
    const question = ctx.attr(node, "question");
    const parts = question ? [`**${question}**`] : [];

    for (const child of node.children ?? []) {
      if (child.name !== "details") {
        const rendered = ctx.render(child);
        if (rendered.trim() !== "") parts.push(rendered);
        continue;
      }

      const { summary, branch } = splitBranch(child, ctx);
      const condition = summary ? ctx.text(summary) : "";
      if (condition) parts.push(`**${IF[ctx.locale]}: ${condition}**`);
      parts.push(...branch);
    }

    return parts.join("\n\n");
  },
});
