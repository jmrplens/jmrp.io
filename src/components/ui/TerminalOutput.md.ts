import { decodeHtml } from "@utils/html";
import { markdownFor } from "@utils/llms/mdx/types";

/**
 * `<TerminalOutput>` and `<TerminalSessionOutput>` are what a command printed.
 * One module for both, for the reason given in `TerminalCommand.md.ts`.
 *
 * The content arrives in two shapes and that is the whole problem this module
 * solves: ~100 of them are a fence, but ~90 are bare text — and bare terminal
 * text is not prose. `# Safely appends without removing existing jobs` parses
 * as an H1 (cron-builder), `*   Trying [::1]:443` as a bullet list and
 * `> GET /.env HTTP/2` as a blockquote (post 005, curl -v). Emitted as-is,
 * those would inject phantom headings into the document outline and turn a
 * transcript into markdown structure that was never there. So the text form is
 * wrapped in a fence: it is literal output, and a fence is what says so.
 *
 * Kept: the output bytes and the `title` from the card header. Both keep the
 * word "Output" in front, because the page can say "this is output" with the
 * terminal card's chrome and markdown cannot — and without it a `text` fence
 * of config-looking lines reads as something to run rather than something a
 * command printed.
 *
 * Dropped: `aria-live`, the copy button, and the scroll region — all of them
 * viewport concerns.
 *
 * Not done: merging the command and its output into one `console` transcript.
 * That is how a terminal reads, but it welds the two together, and the command
 * is the part worth lifting verbatim; keeping it in its own `bash` fence keeps
 * it ready to paste, and the labelled block right underneath already reads as
 * its output.
 */
const OUTPUT = { en: "Output", es: "Salida" } as const;

/**
 * Titles that already say "output" — 46 of the 200 in the corpus, in either
 * language regardless of the file's locale ("Base64 Output", "Salida Base64").
 * Prefixing those would read "Output — Nginx version output".
 */
const SAYS_OUTPUT = /output|salida/iu;

export default markdownFor({
  tag: ["TerminalOutput", "TerminalSessionOutput"],
  toMarkdown(node, ctx) {
    const children = node.children ?? [];
    const fences = children.filter((c) => c.type === "code");
    const [fence] = fences;
    // The plain shape: one fence and nothing else. Anything richer keeps its
    // rendered children, whatever they are.
    const onlyFence = fences.length === 1 && children.length === 1;
    // `ctx.body` slices the source, so a bare-text output keeps the exact
    // bytes of every line — including the `*`/`>`/`#` that made markdown
    // misread it in the first place.
    // Same entity trap as TerminalCommand: bare-text output comes from JSX
    // children, where `&lt;` is the only way to write `<`, so it is decoded
    // here. The single-fence branch keeps its bytes untouched.
    const content = onlyFence
      ? (fence?.value ?? "")
      : decodeHtml(ctx.body(node));
    if (!content.trim()) return "";

    let block: string;
    if (onlyFence) {
      // An empty info string is the norm here; `text` states outright that
      // the block is literal, a better default for output than an unlabelled
      // fence. An info string the author typed still wins.
      block = `\`\`\`${fence?.lang || "text"}\n${content}\n\`\`\``;
    } else if (fences.length > 0) {
      // Fence plus prose: wrapping would nest fences and corrupt both.
      // Nothing in the corpus mixes them, so this only has to be safe.
      block = content;
    } else {
      block = `\`\`\`text\n${content}\n\`\`\``;
    }

    const title = ctx.attr(node, "title") ?? ctx.attr(node, "ariaLabel");
    let label: string = OUTPUT[ctx.locale];
    if (title) label = SAYS_OUTPUT.test(title) ? title : `${label} — ${title}`;
    return `**${label}**\n\n${block}`;
  },
});
