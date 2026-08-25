import { markdownFor } from "@utils/llms/mdx/types";

/**
 * Inside a `<Tabs>` this module never runs: `Tabs.md.ts` renders its own
 * panels so it can number them `i/N`, which a panel cannot know about itself.
 * This is the standalone form — a panel that lost its container, where the
 * label is still the only thing saying what the block is for.
 *
 * `noPadding` is discarded: it exists to let a code block sit flush against
 * the panel border.
 */
export default markdownFor({
  tag: "TabPanel",
  toMarkdown(node, ctx) {
    const label = ctx.attr(node, "label");
    const body = ctx.body(node);
    return label ? `**${label}**\n\n${body}` : body;
  },
});
