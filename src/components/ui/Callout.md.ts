import { markdownFor } from "@utils/llms/mdx/types";

/**
 * The `type` is the whole point of a callout: "this is a warning" is a claim
 * about the content that the prose itself often does not repeat. It becomes a
 * bold label rather than a blockquote, because a callout may contain a fenced
 * code block (post 003 has one) and quoting every line would put `> ` inside
 * the fence.
 */
const LABEL = {
  en: {
    info: "Info",
    warning: "Warning",
    error: "Error",
    success: "Success",
    tip: "Tip",
    note: "Note",
    keypoint: "Key point",
    important: "Important",
  },
  es: {
    info: "Información",
    warning: "Advertencia",
    error: "Error",
    success: "Correcto",
    tip: "Consejo",
    note: "Nota",
    keypoint: "Idea clave",
    important: "Importante",
  },
} as const;

export default markdownFor({
  tag: "Callout",
  toMarkdown(node, ctx) {
    const type = (ctx.attr(node, "type") ??
      "note") as keyof (typeof LABEL)["en"];
    const label = LABEL[ctx.locale][type] ?? LABEL[ctx.locale].note;
    const title = ctx.attr(node, "title");
    const heading = title ? `**${label} — ${title}**` : `**${label}**`;
    return `${heading}\n\n${ctx.body(node)}`;
  },
});
