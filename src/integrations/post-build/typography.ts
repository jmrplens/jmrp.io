/**
 * Undoing SmartyPants inside verbatim machine text.
 *
 * Split out of `html.ts` in 2026-09 (GEO audit #7, A3) for two reasons: the
 * repair stopped being about `<code>` alone, and it is the one post-build step
 * whose correctness is defined entirely by a string transform, so it is worth
 * unit-testing in isolation. The module deliberately has no runtime imports —
 * only a `CheerioAPI` type — so `node --test` can load it straight from source.
 */
import type * as cheerio from "cheerio";

/**
 * Narrows a Cheerio child node to a DOM text node.
 *
 * `node.type === "text"` compares a string against domhandler's `ElementType`
 * enum, which ESLint rejects; `nodeType === 3` is the DOM-standard check and
 * carries the type narrowing needed to touch `.data`.
 *
 * @param node - Child node from a Cheerio `.contents()` traversal.
 * @returns `true` when the node is a text node.
 */
function isTextNode(node: { nodeType?: number }): node is { data: string } & {
  nodeType: number;
} {
  return node.nodeType === 3;
}

/**
 * Elements whose text is verbatim machine input or output — the bytes a reader
 * copies, pastes and runs. Typographic substitution inside any of them ships a
 * command that fails.
 *
 * `code, pre` was the whole list from 205d494 (2026-08-22) until 2026-09, and
 * that is exactly why the terminal family kept its damage through the two
 * audits in between: `<TerminalCommand>` and `<TerminalSessionCommand>` render
 * a command line as `<span class="term-cmd">` and every other line as
 * `<span class="term-out">`, `<TerminalSessionOutput>` renders as
 * `<span class="ts-output__line">`, and none of them is a `<code>` or a
 * `<pre>`. So the list is keyed on the CONTAINER of verbatim text rather than
 * on a tag name, which is what makes it survive a component adding another
 * line shape.
 *
 * `.jmrp-term > .copy-content` is scoped to a direct child on purpose:
 * `<PublicationItem>` puts that same class on a paper abstract, which is prose
 * and MUST keep its curly quotes.
 */
const VERBATIM_TEXT_ROOTS = [
  "code",
  "pre",
  // Terminal card body: command lines, comment/blank lines, output lines, and
  // the hidden `.ts-command-raw` a parent <TerminalSession> reads its clipboard
  // text out of.
  ".jmrp-term__body",
  // <TerminalSession>'s hidden clipboard fallback.
  ".jmrp-term > .copy-content",
].join(", ");

/**
 * Cards that also carry a COPY of their verbatim text in an attribute. Both
 * such attributes live in the card head, outside `.jmrp-term__body`, so the
 * attribute pass is scoped to the whole card instead.
 */
const VERBATIM_CARDS = ".jmrp-term, .jmrp-code, .jmrp-file";

/**
 * Attributes repaired inside {@link VERBATIM_CARDS}.
 *
 * `data-content` is the clipboard payload `<CopyButton>` hands to
 * `navigator.clipboard`, URL-encoded. It is a second copy of the same bytes,
 * built in the component from `Astro.slots.render()`, and it is not a DOM text
 * node at all — which is why repairing only text left `<TerminalOutput>`
 * *showing* `--with-http_v3_module` while its button still *copied*
 * `—with-http_v3_module`.
 *
 * `aria-label` quotes the command into the accessible name ("Copy command:
 * {command}"). Repairing it keeps what a screen reader dictates identical to
 * what the page shows. The trade-off is deliberate and one-directional: a card
 * `title` holding an authored apostrophe would have it straightened in its
 * accessible name only — inaudible — whereas leaving it alone dictates a
 * command that does not run.
 *
 * Nothing else is touched. `title` and the prose `aria-label` of
 * `a.external-link` (19 authored apostrophes: "Nginx Beginner’s Guide",
 * "O’Dwyer on ELF string merging") sit outside these cards and stay curly.
 */
const VERBATIM_ATTRIBUTES = ["data-content", "aria-label"] as const;

/**
 * Applies the three unambiguous reversals to one verbatim string.
 *
 * Only these three: `‘ ’` → `'` · `“ ”` → `"` · `—` glued to a word → `--`.
 *
 * En dashes and ellipses are deliberately left alone: the corpus contains
 * *authored* ones inside code (`0–59` and `1–31` in cron-builder, `id,en,es,…`
 * in string-pool-packer) and they are indistinguishable from generated ones.
 * Neither breaks a copied command, unlike a curly quote or a mangled `--` flag.
 *
 * @param text - Verbatim text, possibly carrying SmartyPants damage.
 * @returns The same string with the three substitutions reverted.
 */
function repairVerbatimText(text: string): string {
  return (
    text
      .replaceAll(/[\u{2018}\u{2019}]/gu, "'")
      .replaceAll(/[\u{201C}\u{201D}]/gu, '"')
      // Only an em dash glued to a word character is a mangled `--flag`.
      // A standalone one is authored: TimestampConverter.astro ships
      // <code>—</code> as its empty-value placeholder, and .astro files
      // never pass through SmartyPants at all.
      .replaceAll(/\u{2014}(?=[\p{L}\p{N}])/gu, "--")
  );
}

/**
 * Repairs one attribute value, decoding it first when it is a URL-encoded
 * clipboard payload.
 *
 * @param name - Attribute name, from {@link VERBATIM_ATTRIBUTES}.
 * @param value - Current attribute value.
 * @returns The repaired value, or the original when nothing changed.
 */
function repairVerbatimAttribute(name: string, value: string): string {
  if (name !== "data-content") return repairVerbatimText(value);
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Not a well-formed payload; leave it exactly as found.
    return value;
  }
  const repaired = repairVerbatimText(decoded);
  return repaired === decoded ? value : encodeURIComponent(repaired);
}

/**
 * Undoes SmartyPants' typographic substitution everywhere a page presents
 * verbatim machine text: inside `<code>`/`<pre>`, inside the terminal cards,
 * and inside the clipboard payload and accessible name those cards carry.
 *
 * Astro runs `remark-smartypants` at position 3 of the markdown chain — before
 * any user remark plugin and long before `rehypeRaw` — so it cannot be ordered
 * around from `astro.config.mjs`. Backtick spans survive (they are `inlineCode`
 * mdast nodes, which SmartyPants skips), but a raw `<code>` written as HTML —
 * which is the only option inside the HTML tables this site uses — leaves its
 * contents as a plain `text` node, and that does get typographic treatment. So
 * does anything a component later lifts back out with `Astro.slots.render()`
 * and re-renders as plain text, which is how the terminal family is built.
 *
 * The damage is not cosmetic: it ships code that fails if copied. Measured on
 * the 2026-08-22 GEO audit — `‘unsafe-inline’` (invalid CSP keyword),
 * `return 200 “OK”;` (rejected by nginx) and `--with-http_v3_module` rendered
 * as `—with-http_v3_module` (a flag that does not exist).
 *
 * Measured again on the 2026-09-03 audit (#7, A3), 12 days and two audits
 * after the `code, pre` pass landed: 28 visible commands across 12 pages still
 * broken (`base64 —decode`, `date -d “…”`), 44 clipboard payloads and the 84
 * accessible names quoting those 28 commands — and `—with-http_v3_module`, the
 * flag this function's own comment cites as its reason to exist, was *still*
 * what the Copy button handed out on post 004, in both locales, because the
 * visible `<pre>` was repaired and the attribute beside it was not. Hence the
 * two passes below.
 *
 * @param $ - Cheerio API for the page.
 * @returns `true` when at least one verbatim fragment was repaired.
 */
export function restoreVerbatimTypography($: cheerio.CheerioAPI): boolean {
  let modified = false;

  // Pass 1 — text. `.find("*").addBack().contents()` yields every descendant
  // node of every root, at any depth; the roots nest (a <pre> lives inside
  // `.jmrp-term__body`), so nodes are de-duplicated rather than repaired twice.
  const visited = new Set<unknown>();
  $(VERBATIM_TEXT_ROOTS)
    .find("*")
    .addBack()
    .contents()
    .each((_i, node) => {
      if (!isTextNode(node) || visited.has(node)) return;
      visited.add(node);
      const repaired = repairVerbatimText(node.data);
      if (repaired !== node.data) {
        node.data = repaired;
        modified = true;
      }
    });

  // Pass 2 — the copies of that text held in attributes.
  $(VERBATIM_CARDS)
    .find("*")
    .addBack()
    .each((_i, el) => {
      const $el = $(el);
      for (const name of VERBATIM_ATTRIBUTES) {
        const value = $el.attr(name);
        if (value === undefined) continue;
        const repaired = repairVerbatimAttribute(name, value);
        if (repaired !== value) {
          $el.attr(name, repaired);
          modified = true;
        }
      }
    });

  return modified;
}
