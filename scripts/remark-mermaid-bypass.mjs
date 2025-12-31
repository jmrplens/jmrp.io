/**
 * Remark Mermaid Bypass Plugin
 *
 * A custom Remark plugin that identifies code blocks tagged with 'mermaid-render'
 * and transforms them into standard <pre class="mermaid"> tags.
 *
 * This is used to allow Astro components or other tools to handle the Mermaid
 * rendering on the client-side or during a separate build step, while
 * keeping the original Mermaid syntax intact in the MDX source.
 */

import { visit } from "unist-util-visit";

export function remarkMermaidBypass() {
  return (tree) => {
    visit(tree, "code", (node, index, parent) => {
      if (node.lang === "mermaid-render") {
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
