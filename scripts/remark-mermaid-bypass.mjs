import { visit } from "unist-util-visit";

export function remarkMermaidBypass() {
  return (tree) => {
    visit(tree, "code", (node, index, parent) => {
      if (node.lang === "mermaid-render") {
        // Transform to a single pre.mermaid block
        // rehype-mermaid will pick this up automatically
        const newNode = {
          type: "element",
          tagName: "pre",
          properties: {
            className: ["mermaid"],
          },
          children: [
            {
              type: "text",
              value: node.value,
            },
          ],
          // For MDX/HAST conversion
          data: {
            hName: "pre",
            hProperties: {
              className: ["mermaid"],
            },
          },
        };

        parent.children.splice(index, 1, newNode);
        return index + 1;
      }
    });
  };
}
