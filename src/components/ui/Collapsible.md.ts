import { markdownFor } from "@utils/llms/mdx/types";

/**
 * Hidden on the page, but still content: post 010 keeps a ~230-line generator
 * inside one. The summary line is kept as a bold lead-in so the body has a
 * label, and the body is emitted in full — "collapsed" is a viewport concern
 * with no meaning to a reader that has no viewport.
 */
export default markdownFor({
  tag: "Collapsible",
  toMarkdown(node, ctx) {
    const title = ctx.attr(node, "title");
    return title ? `**${title}**\n\n${ctx.body(node)}` : ctx.body(node);
  },
});
