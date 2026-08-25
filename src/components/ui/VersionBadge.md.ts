import { markdownFor } from "@utils/llms/mdx/types";

/**
 * An inline chip, and the only component in this group that is part of a
 * sentence: "this feature requires <VersionBadge value="Nginx 1.19+" /> and
 * supports <VersionBadge type="level" value="3" />" loses its object entirely
 * if the tag contributes nothing, because the badge holds the noun. So the
 * output is inline too — bold, never a block.
 *
 * `type` only shows through when it has no `value`, exactly as the component
 * does it: the badge then prints the type word itself, and it prints it in
 * English in both locales (only the "Level" prefix is translated). That is
 * mirrored rather than fixed, so the text matches the page.
 *
 * Not used by any published post — the corpus reaches it through the
 * component library, not through content. Kept: prefix and value. Dropped: the
 * colour and the "new" bullet, which are decorative.
 */
const LEVEL = { en: "Level", es: "Nivel" } as const;

export default markdownFor({
  tag: "VersionBadge",
  toMarkdown(node, ctx) {
    const type = ctx.attr(node, "type") ?? "version";
    const value =
      ctx.attr(node, "value") ?? type.charAt(0).toUpperCase() + type.slice(1);
    const text = type === "level" ? `${LEVEL[ctx.locale]} ${value}` : value;
    return `**${text}**`;
  },
});
