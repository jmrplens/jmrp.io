import { markdownFor } from "@utils/llms/mdx/types";

/**
 * The interactive application on a tool page. There is nothing to convert: the
 * wrapper holds one app component whose entire substance is DOM built by
 * `<script is:inline>`, so it renders to an empty string and the tag would
 * otherwise vanish without trace.
 *
 * What replaces it is one sentence, and deliberately only one. The tool's
 * title, URL, category, tags, description, features and FAQ all already reach
 * the corpus from the frontmatter (`buildToolSection()` in `src/utils/llms.ts`),
 * so restating any of them 34 times would be duplication, not signal. The one
 * fact that lives nowhere else is the framing: this page IS the working tool,
 * not an article about one. Without it the converted body opens on
 * "About This Tool" and every instruction under it — "enable the directives you
 * need", "copy and add to your server configuration" — refers to an app the
 * reader was never told exists.
 *
 * Note what the sentence does NOT claim: that the tool runs client-side. It is
 * true of fifteen of the seventeen, but the certificate inspector and the HTTP
 * header analyzer fetch the target you point them at, and this component has no
 * prop to tell them apart. A blanket "runs in your browser" here would be a
 * checkable falsehood on two pages; the per-tool `description` already makes
 * the claim where it is actually true.
 */
const NOTE = {
  en: "**Interactive tool** — this page hosts the working application itself, not a description of one.",
  es: "**Herramienta interactiva** — esta página contiene la aplicación en funcionamiento, no una descripción de ella.",
} as const;

export default markdownFor({
  tag: "ToolApp",
  toMarkdown(node, ctx) {
    // Every current usage wraps a single self-closing app component, so this
    // is empty. It is kept so prose added inside the wrapper later is carried
    // out rather than silently swallowed by the note.
    const body = ctx.body(node);
    return body.trim() === ""
      ? NOTE[ctx.locale]
      : `${NOTE[ctx.locale]}\n\n${body}`;
  },
});
