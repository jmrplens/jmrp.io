import { markdownFor } from "@utils/llms/mdx/types";

/**
 * `<Code>` wraps a fence whose info string is usually EMPTY, because the
 * language travels in the `lang` prop and the component passes it to Shiki.
 * Dropping the tag alone would therefore publish an untagged block; the one
 * thing this module writes is that info string.
 */
export default markdownFor({
  tag: ["Code", "CodeBlock"],
  toMarkdown(node, ctx) {
    const fence = (node.children ?? []).find((c) => c.type === "code");
    if (!fence) return ctx.body(node);

    // The fence's own info string wins when it has one: it is what the author
    // typed next to the code, and overwriting it would be the converter
    // second-guessing the source.
    const lang = fence.lang || ctx.attr(node, "lang") || "";
    const title = ctx.attr(node, "title") ?? ctx.attr(node, "aria-label");
    const caption = title ? `**${title}**\n\n` : "";
    return `${caption}\`\`\`${lang}\n${fence.value ?? ""}\n\`\`\``;
  },
});
