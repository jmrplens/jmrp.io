import { markdownFor } from "@utils/llms/mdx/types";

/**
 * The diagram source is fenced as `mermaid-render`, an info string invented
 * for `remark-mermaid-bypass` so the rehype step can find it. Models know
 * `mermaid`, so the fence is renamed on the way out.
 *
 * This is also the one case where the rendered page is WORSE than the source:
 * the built HTML carries the diagram as inline SVG, with the mermaid text
 * gone. Converting from MDX is what keeps it.
 */
export default markdownFor({
  tag: "Mermaid",
  toMarkdown(node, ctx) {
    const fence = (node.children ?? []).find((c) => c.type === "code");
    if (!fence) return ctx.body(node);
    const caption = ctx.attr(node, "caption");
    const heading = caption ? `**${caption}**\n\n` : "";
    return `${heading}\`\`\`mermaid\n${fence.value ?? ""}\n\`\`\``;
  },
});
