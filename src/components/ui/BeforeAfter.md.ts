import { markdownFor, type MdxNode } from "@utils/llms/mdx/types";

/**
 * Two slotted blocks whose only distinguishing marks on the page are their
 * header labels and a red/green accent. Dropping the tag alone publishes the
 * two bodies back to back with nothing between them, which is the one failure
 * that matters here: the corpus compares `Vulnerable` against `Protected` and
 * `root (appends URI)` against `alias (replaces prefix)`, and a reader that
 * cannot tell the sides apart gets exactly inverted advice.
 *
 * The output reproduces the component's accessible name tree — the group name
 * (`Comparison: A vs B`) plus each section's own name — and nothing else. In
 * particular it does NOT stamp the sides as bad/good: the red/green accent is
 * the only place that polarity lives, it is carried by colour alone, and it is
 * plainly wrong for a pair like `What censors see` / `What actually happens`.
 * Inferring a verdict the page never states would be this module inventing
 * content.
 *
 * The group line repeats both labels one line before the sections do. That is
 * deliberate: the labels have to sit next to their own body, because bodies
 * run to dozens of lines and a retrieval chunk may well contain only one of
 * them, while the group line is what says the two are a single comparison in
 * a fixed order rather than two consecutive steps.
 *
 * Content outside the two named slots is dropped, because the component
 * renders no default slot: it is not on the page either.
 */
const TEXT = {
  en: { comparison: "Comparison", before: "Before", after: "After" },
  es: { comparison: "Comparación", before: "Antes", after: "Después" },
} as const;

export default markdownFor({
  tag: "BeforeAfter",
  toMarkdown(node, ctx) {
    const t = TEXT[ctx.locale];

    // The slots are written as `<div slot="before">` (and once as
    // `<Fragment slot="before">`), so the wrapper element carries the slot
    // name and its children carry the content.
    const slot = (name: string): MdxNode | undefined =>
      (node.children ?? []).find((child) => ctx.attr(child, "slot") === name);

    const before = slot("before");
    const after = slot("after");
    if (!before && !after) return ctx.body(node);

    const beforeLabel = ctx.attr(node, "beforeLabel") ?? t.before;
    const afterLabel = ctx.attr(node, "afterLabel") ?? t.after;

    const parts = [`**${t.comparison}: ${beforeLabel} vs ${afterLabel}**`];
    if (before) parts.push(`**${beforeLabel}**\n\n${ctx.body(before)}`);
    if (after) parts.push(`**${afterLabel}**\n\n${ctx.body(after)}`);
    return parts.join("\n\n");
  },
});
