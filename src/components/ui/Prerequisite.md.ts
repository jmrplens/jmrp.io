import { markdownFor } from "@utils/llms/mdx/types";

/**
 * A box that says "you need these before you start". The body is ordinary
 * markdown and survives on its own; what would be lost is the frame around it,
 * and the frame is the claim: without it a bulleted list of Nginx versions and
 * shell access reads as background trivia rather than as the entry condition
 * for everything below.
 *
 * Kept: the title (defaulted the way the component defaults it, since most
 * uses omit the prop) and the whole body. Dropped: the icon.
 */
const DEFAULT_TITLE = {
  en: "Prerequisites",
  es: "Requisitos previos",
} as const;

export default markdownFor({
  tag: "Prerequisite",
  toMarkdown(node, ctx) {
    const title = ctx.attr(node, "title") ?? DEFAULT_TITLE[ctx.locale];
    return `**${title}**\n\n${ctx.body(node)}`;
  },
});
