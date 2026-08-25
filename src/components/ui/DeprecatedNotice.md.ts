import { markdownFor } from "@utils/llms/mdx/types";

/**
 * The single-purpose ancestor of `StateNotice` (which absorbed it as its
 * `deprecated` type) and, like it, a component whose whole content is props:
 * the feature, the removal date and the replacement. There is nothing in the
 * body to fall back on, so without this module the deprecation simply
 * disappears from the text.
 *
 * Its wording is its own — the component uses the `components.deprecated.*`
 * keys, not `StateNotice`'s — so the strings are repeated here rather than
 * shared, and stay repeated on purpose: the day one of the two is reworded,
 * the other must not follow silently.
 *
 * Not used by any published post; it exists for the component library.
 * Kept: label, feature, removal date, alternative (+ link), body. Dropped:
 * nothing.
 */
const TEXT = {
  en: {
    label: "Deprecated",
    isDeprecated: "is deprecated",
    willBeRemoved: "and will be removed in",
    useInstead: "Use instead:",
  },
  es: {
    label: "Obsoleto",
    isDeprecated: "está obsoleto",
    willBeRemoved: "y se eliminará en",
    useInstead: "Usar en su lugar:",
  },
} as const;

export default markdownFor({
  tag: "DeprecatedNotice",
  toMarkdown(node, ctx) {
    const words = TEXT[ctx.locale];
    const blocks = [`**${words.label}**`];

    const feature = ctx.attr(node, "feature");
    if (feature) {
      const removalDate = ctx.attr(node, "removalDate");
      const deadline = removalDate
        ? ` ${words.willBeRemoved} ${removalDate}`
        : "";
      blocks.push(`\`${feature}\` ${words.isDeprecated}${deadline}.`);
    }

    const alternative = ctx.attr(node, "alternative");
    if (alternative) {
      const url = ctx.attr(node, "alternativeUrl");
      const target = url
        ? `[\`${alternative}\`](${url})`
        : `\`${alternative}\``;
      blocks.push(`${words.useInstead} ${target}`);
    }

    const body = ctx.body(node);
    if (body.trim() !== "") blocks.push(body);

    return blocks.join("\n\n");
  },
});
