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

/**
 * Creates a Remark plugin that transforms 'mermaid-render' code blocks into HTML <pre> tags.
 * This preserves the Mermaid syntax for client-side rendering.
 *
 * @returns {import('unified').Transformer} A unified/remark transformer function.
 */
export function remarkMermaidBypass() {
  return (tree) => {
    visit(tree, "code", (node, index, parent) => {
      if (node.lang === "mermaid-render") {
        // Use proper hast node structure instead of type: "html"
        // This ensures content is properly handled by the processor
        const newNode = {
          type: "paragraph", // Use paragraph as container type
          position: node.position,
          data: {
            hName: "pre",
            hProperties: {
              className: ["mermaid"],
            },
            hChildren: [
              {
                type: "text",
                value: node.value, // Text nodes are auto-escaped by hast
              },
            ],
          },
        };

        parent.children[index] = newNode;
        return index + 1;
      }
    });
  };
}
