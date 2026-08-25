import { markdownFor } from "@utils/llms/mdx/types";

/**
 * The frame around a run of commands and their outputs. Its two children are
 * handled by `TerminalCommand.md.ts` and `TerminalOutput.md.ts` — this module
 * only has to decide what the wrapper itself adds.
 *
 * Which is: almost nothing. The children already render as a command fence
 * followed by a labelled output block, in source order, so the session's job
 * on the page — drawing one card around them — has no text equivalent worth
 * writing. Announcing "Terminal session" before all 155 of them would be a
 * line of chrome per session and no information.
 *
 * The exception is `title`, on 12 of them, and it is the one thing on the card
 * that is not chrome: "PPPoE Client Status", "zsh · edge-01" — it says which
 * host or which shell the commands below belong to, which nothing else in the
 * block states.
 *
 * Dropped: the copy-only-commands button, the traffic-light dots and the
 * generated aria-label (it is built from the first command, which is already
 * right there).
 */
const SESSION = {
  en: "Terminal session",
  es: "Sesión de terminal",
} as const;

export default markdownFor({
  tag: "TerminalSession",
  toMarkdown(node, ctx) {
    const body = ctx.body(node);
    if (!body.trim()) return "";
    const title = ctx.attr(node, "title") ?? ctx.attr(node, "ariaLabel");
    return title ? `**${SESSION[ctx.locale]} — ${title}**\n\n${body}` : body;
  },
});
