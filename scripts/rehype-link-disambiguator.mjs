import { visit } from "unist-util-visit";

/**
 * Helper to extract all text content from a HAST node.
 */
function toText(node) {
  if (node.type === "text") return node.value;
  if (node.children) return node.children.map(toText).join("");
  return "";
}

/**
 * Generates a human-friendly label for a URL destination.
 */
function getDestinationLabel(href, text) {
  if (!URL.canParse(href, "https://jmrp.io")) {
    return `${text} (${href})`;
  }

  const url = new URL(href, "https://jmrp.io");
  const isLocal = url.hostname === "jmrp.io" || url.hostname === "";

  if (isLocal) {
    return `${text} (on ${url.pathname})`;
  }

  const path = url.pathname && url.pathname !== "/" ? url.pathname : "";
  return `${text} (at ${url.hostname}${path})`;
}

/**
 * Rehype plugin to automatically add aria-labels to links with identical text
 * but different destinations on the same page. This helps satisfy accessibility
 * rules like PageSpeed's "Links with same name must have same purpose".
 */
export const rehypeLinkDisambiguator = () => (tree) => {
  const linksByText = new Map();

  // First pass: identify texts that point to multiple destinations
  visit(tree, "element", (node) => {
    if (node.tagName !== "a") return;

    const text = toText(node).trim();
    const href = node.properties?.href;
    if (!text || !href) return;

    if (!linksByText.has(text)) {
      linksByText.set(text, new Set());
    }
    linksByText.get(text).add(href);
  });

  // Second pass: add aria-label to links with ambiguous text
  visit(tree, "element", (node) => {
    if (node.tagName !== "a") return;

    const text = toText(node).trim();
    const href = node.properties?.href;
    if (!text || !href) return;

    const destinations = linksByText.get(text);
    const isAmbiguous = destinations && destinations.size > 1;

    if (isAmbiguous && !node.properties.ariaLabel) {
      node.properties.ariaLabel = getDestinationLabel(href, text);
    }
  });
};
