import { markdownFor } from "@utils/llms/mdx/types";

/**
 * The answer-target of every post, and the block an answer engine is most
 * likely to lift whole. It renders as an `<h2>` on the page, so it becomes a
 * real H2 here too: that gives a retrieval pipeline chunking on H2 boundaries
 * a chunk that starts with the summary instead of burying it mid-section.
 */
export default markdownFor({
  tag: "TLDRSummary",
  toMarkdown(node, ctx) {
    const title = ctx.attr(node, "title") ?? "TL;DR";
    return `## ${title}\n\n${ctx.body(node)}`;
  },
});
