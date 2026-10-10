import { markdownFor } from "@utils/llms/mdx/types";

/** One position of the selection. */
interface TreeNode {
  name?: string;
  type?: string;
  state?: "ok" | "null" | "empty" | "conditional" | "unreached";
  note?: string;
  spine?: boolean;
  children?: TreeNode[];
}

const WORDS = {
  en: {
    states: {
      ok: "declared",
      null: "declares nothing",
      empty: "served empty",
      conditional: "needs another permission",
      unreached: "not reached",
    },
    spine: "on the answer spine",
  },
  es: {
    states: {
      ok: "declarado",
      null: "no declara nada",
      empty: "se sirve vacío",
      conditional: "necesita otro permiso",
      unreached: "no se alcanza",
    },
    spine: "en la columna de la respuesta",
  },
} as const;

/**
 * A selection is a tree, and a nested list is the markdown form of a tree, so
 * each position becomes one item indented under its parent: the field in code,
 * its type, the verdict in words and the spine flag, then the note. The verdict
 * line closes it, since it is the claim the figure exists to make.
 */
export default markdownFor({
  tag: "SelectionTree",
  toMarkdown(node, ctx) {
    const raw = ctx.expr<TreeNode | TreeNode[]>(node, "root");
    if (!raw) return ctx.body(node);
    const roots = Array.isArray(raw) ? raw : [raw];
    const words = WORDS[ctx.locale];

    const lines: string[] = [];
    /**
     * Writes one position and its children.
     *
     * @param item - The position.
     * @param depth - Its depth, 0 for a root.
     */
    const walk = (item: TreeNode, depth: number): void => {
      const facts = [
        item?.type ? `\`${item.type}\`` : "",
        item?.state ? words.states[item.state] : "",
        item?.spine ? words.spine : "",
      ].filter(Boolean);
      const facet = facts.length > 0 ? ` (${facts.join(", ")})` : "";
      const note = item?.note ? `: ${item.note}` : "";
      lines.push(
        `${"  ".repeat(depth)}- \`${item?.name ?? ""}\`${facet}${note}`,
      );
      for (const child of item?.children ?? []) walk(child, depth + 1);
    };
    for (const item of roots) walk(item, 0);

    const title = ctx.attr(node, "title");
    const operation = ctx.attr(node, "operation");
    const verdict = ctx.attr(node, "verdict");
    const caption = ctx.attr(node, "caption");
    return [
      title ? `**\`${title}\`**` : "",
      operation ? `\`${operation}\`` : "",
      lines.join("\n"),
      verdict ?? "",
      caption ?? "",
    ]
      .filter(Boolean)
      .join("\n\n");
  },
});
