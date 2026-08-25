import { markdownFor } from "@utils/llms/mdx/types";

/**
 * `<TerminalCommand>` and its in-session twin `<TerminalSessionCommand>` are
 * the same block — a shell card whose copy button yields the command with the
 * prompt stripped — so one module covers both. Grouping the terminal family by
 * behavior (command / output / frame) rather than by the `terminal-session`
 * barrel is what keeps each rule in one place: the barrel split would have put
 * the same fence handling in two files.
 *
 * Kept: the command bytes, the fence language, and a caption when the author
 * wrote one. `title` wins over `ariaLabel`, the precedence `Code.md.ts` uses —
 * the accessible name is precisely what a consumer with no screen is handed,
 * and 80 of these blocks carry one ("Command to verify Nginx version…").
 *
 * Dropped: the `❯` prompt and the card chrome. The prompt is decoration, and
 * writing it into the fence would ruin the one thing a command block is for —
 * being pasted into a shell. `prompt="#"` is the exception: root is a claim
 * about who runs this that command text without `sudo` does not carry, so it
 * survives as a caption clause rather than as a character the reader would
 * have to strip.
 */
const ROOT_PROMPT = {
  en: "run as root",
  es: "ejecutar como root",
} as const;

/**
 * A RouterOS command: one leading slash and then a single path segment
 * (`/interface wireguard print`, `/ipv6 pool print`). An absolute shell path
 * carries a second slash (`/usr/local/bin/backup.sh`), which is what stops
 * this from stealing shell commands.
 */
const ROUTEROS_COMMAND = /^\/[a-z][\w-]*(?:\s|$)/u;

/**
 * Language for a command block that did not label its own fence.
 *
 * The card is a shell card, so the default is shell — but 12 of the 80
 * unlabelled commands in the corpus are RouterOS typed into a router's CLI,
 * and calling those `bash` hands a model a shell command that is not one. The
 * repo already spells that language `routeros` (custom Shiki grammar, 206
 * uses), so the guess has somewhere true to land.
 *
 * @param code - The command text.
 * @returns A fence info string.
 */
function guessLanguage(code: string): string {
  const first = code
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "" && !line.startsWith("#"));
  return first && ROUTEROS_COMMAND.test(first) ? "routeros" : "bash";
}

export default markdownFor({
  tag: ["TerminalCommand", "TerminalSessionCommand"],
  toMarkdown(node, ctx) {
    const fence = (node.children ?? []).find((c) => c.type === "code");
    // Half the session commands are written as bare text rather than a fence
    // (`<TerminalSessionCommand>crontab -l</TerminalSessionCommand>`). Both
    // forms are a command, so both leave here as one.
    const code = fence ? (fence.value ?? "") : ctx.body(node);
    if (!code.trim()) return "";

    // An info string the author typed always wins; only the unlabelled blocks
    // (every bare-text command, and ~90 fences) need a language guessed.
    const lang = fence?.lang || guessLanguage(code);

    const parts: string[] = [];
    const caption = ctx.attr(node, "title") ?? ctx.attr(node, "ariaLabel");
    if (caption) parts.push(caption);
    if (ctx.attr(node, "prompt") === "#") parts.push(ROOT_PROMPT[ctx.locale]);
    const heading = parts.length > 0 ? `**${parts.join(" — ")}**\n\n` : "";

    return `${heading}\`\`\`${lang}\n${code}\n\`\`\``;
  },
});
