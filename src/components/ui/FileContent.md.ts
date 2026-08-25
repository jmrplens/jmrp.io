import { markdownFor } from "@utils/llms/mdx/types";

/**
 * A fence says what to write; `<FileContent>` says WHERE it goes, and that is
 * the half a reader cannot reconstruct. `/etc/nginx/snippets/tarpit.conf` is
 * most of the answer to "how do I set this up", so the `filename` becomes a
 * labelled lead-in instead of being dropped with the tag — otherwise the 158
 * usages in the corpus turn into 158 anonymous code blocks.
 *
 * Kept: the filename, the fence with its language, and the authored one-line
 * description (`title`, else `ariaLabel`) — both are hand-written summaries of
 * the file that never merely repeat the path.
 *
 * Dropped: `collapsible` and `open`, which say how much of the block a browser
 * paints first. That is a viewport state, and a reader with no viewport has
 * none; the body is emitted in full either way, as in `Collapsible`.
 *
 * `title` is worth a note: 22 usages pass it, but the component neither
 * declares nor renders it, so it is invisible on the page. It is emitted here
 * because it is authored, accurate prose about the file — the fix belongs in
 * the component or the MDX, not in a converter that would rather lose it.
 */
const FILE = { en: "File", es: "Fichero" } as const;

/**
 * Whether a token names a file rather than reading as prose.
 *
 * `filename` is a free-text header, and a minority of usages put a caption
 * there instead of a path ("try_files example", "Add to server block").
 * Claiming those are files would be a small lie repeated in every conversion,
 * so the "File:" prefix is spent only on a token with a directory separator or
 * an extension; anything else is emitted as the plain caption it is.
 *
 * @param head - The first whitespace-delimited token of the value.
 * @returns True when the token looks like a path or a file name.
 */
function namesAFile(head: string): boolean {
  return head.includes("/") || /\.[A-Za-z0-9]{1,8}$/u.test(head);
}

export default markdownFor({
  tag: "FileContent",
  toMarkdown(node, ctx) {
    const fence = (node.children ?? []).find((c) => c.type === "code");
    // All 158 usages wrap exactly one fence. Without one there is nothing this
    // module can label, so the children still carry whatever content there is.
    if (!fence) return ctx.body(node);

    // The fence's own info string wins over the `language` prop for the same
    // reason as in `Code`: it is what the author typed next to the code.
    const lang = fence.lang || ctx.attr(node, "language") || "";
    const block = `\`\`\`${lang}\n${fence.value ?? ""}\n\`\`\``;

    const filename = ctx.attr(node, "filename")?.trim();
    if (!filename) return block;

    // A qualified header ("wg_home.conf (Windows)") keeps its qualifier outside
    // the backticks, so what is quoted as code is only the part that is one.
    const space = filename.search(/\s/u);
    const head = space === -1 ? filename : filename.slice(0, space);
    const rest = space === -1 ? "" : filename.slice(space);
    const label = namesAFile(head)
      ? `${FILE[ctx.locale]}: \`${head}\`${rest}`
      : filename;

    const description = ctx.attr(node, "title") ?? ctx.attr(node, "ariaLabel");
    const heading = description ? `${label} — ${description}` : label;
    return `**${heading}**\n\n${block}`;
  },
});
