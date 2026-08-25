import { markdownFor } from "@utils/llms/mdx/types";

/** One backend lane. */
interface Lane {
  title?: string;
  secret?: string;
  secretNote?: string;
  crosses?: string;
  reachable?: boolean;
  note?: string;
}

const LABEL = {
  en: {
    secret: "Device secret",
    crosses: "Crosses to software",
    reachable: "Software-reachable?",
    yes: "Yes",
    no: "No",
  },
  es: {
    secret: "Secreto del dispositivo",
    crosses: "Cruza al software",
    reachable: "¿Accesible por software?",
    yes: "Sí",
    no: "No",
  },
} as const;

/**
 * Two lanes, one question: can software read the secret, or does it only ever
 * see a result computed from it? That is a yes/no fact per backend plus what
 * actually crosses the boundary, and it survives losing the drawing intact —
 * "inside the peripheral" is a claim about reach, not about where a box sits.
 *
 * `reachable` is emitted as an explicit yes/no rather than left implicit in the
 * prose note, because it is the comparison the figure exists to make. `kind`
 * ("sealed" / "reachable") is dropped: it picks the lane's styling and says the
 * same thing `reachable` already does.
 */
export default markdownFor({
  tag: "EFuseFlow",
  toMarkdown(node, ctx) {
    const lanes = ctx.expr<Lane[]>(node, "lanes");
    if (!Array.isArray(lanes) || lanes.length === 0) return ctx.body(node);

    const label = LABEL[ctx.locale];
    const lines: string[] = [];
    for (const lane of lanes) {
      const held = lane?.secretNote ? ` — ${lane.secretNote}` : "";
      const reach = lane?.reachable ? label.yes : label.no;
      lines.push(
        `- **${lane?.title ?? ""}**`,
        `  - ${label.secret}: \`${lane?.secret ?? ""}\`${held}`,
        `  - ${label.crosses}: ${lane?.crosses ?? ""}`,
        `  - ${label.reachable} ${reach}`,
      );
      if (lane?.note) lines.push(`  - ${lane.note}`);
    }

    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [title ? `**${title}**` : "", lines.join("\n"), caption ?? ""]
      .filter(Boolean)
      .join("\n\n");
  },
});
