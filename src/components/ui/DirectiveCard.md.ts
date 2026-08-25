import { markdownFor } from "@utils/llms/mdx/types";

/**
 * A directive reference card: the name, its syntax, its default, the spec
 * level it appeared in, a prose description and an optional slot body.
 *
 * Everything except the card chrome survives. The name is emitted as a bold
 * code span rather than a heading, because in post 003 every card already sits
 * directly under its own `### N. \`default-src\`: The Fallback` — a heading
 * here would repeat the directive name one line below itself and give a
 * retrieval pipeline two chunk boundaries for one block.
 *
 * The MDN link is kept: it is the only outbound citation the card carries, and
 * a model answering "where is this documented" has nothing else to point at.
 * The `.astro` sanitizes the URL before rendering it, so the value read here is
 * whatever the author typed — a link, not something executed.
 */
const LABEL = {
  en: { syntax: "Syntax", default: "Default", mdn: "MDN reference" },
  es: {
    syntax: "Sintaxis",
    default: "Predeterminado",
    mdn: "Referencia de MDN",
  },
} as const;

export default markdownFor({
  tag: "DirectiveCard",
  toMarkdown(node, ctx) {
    const label = LABEL[ctx.locale];
    const name = ctx.attr(node, "name");
    // Without a name there is no card to describe, only its contents.
    if (!name) return ctx.body(node);

    const since = ctx.attr(node, "since");
    const syntax = ctx.attr(node, "syntax");
    const defaultValue = ctx.attr(node, "defaultValue");
    const description = ctx.attr(node, "description");
    const mdnUrl = ctx.attr(node, "mdnUrl");

    // Facts as a list, in the order the card shows them: it keeps `Syntax` and
    // `Default` from being read as prose sentences about the description.
    const facts = [
      syntax ? `- ${label.syntax}: \`${syntax}\`` : "",
      defaultValue ? `- ${label.default}: \`${defaultValue}\`` : "",
      mdnUrl ? `- [${label.mdn}](${mdnUrl})` : "",
    ].filter(Boolean);

    const blocks = [
      since ? `**\`${name}\`** — ${since}` : `**\`${name}\`**`,
      facts.join("\n"),
      description ?? "",
      ctx.body(node),
    ];
    return blocks.filter((block) => block.trim() !== "").join("\n\n");
  },
});
