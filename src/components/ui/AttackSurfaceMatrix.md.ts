import { line } from "@utils/llms/mdx/markdown-table";
import { markdownFor } from "@utils/llms/mdx/types";

/**
 * Side-by-side threat lanes: for each attacker model, what they can do, what
 * they cannot, the rate they get, and the one control that stops them. A
 * table is the wrong shape here — `can` and `cannot` are lists of different
 * lengths per lane — so each lane becomes a labelled block with the four
 * fields as bullets, which keeps the can/cannot split explicit instead of
 * merging it into one undifferentiated list.
 *
 * The field labels are the component's own screen-reader table headers
 * (`attackSurfaceMatrix.rate` / `.can` / `.cannot` / `.stoppedBy`), copied
 * rather than imported: these modules keep their visible strings local.
 *
 * `kind` ("online" / "offline") picks the accent colour and the icon, and in
 * practice the lane's own `title` already says which attacker it is. It is
 * appended only when the title does not contain it, so a lane titled
 * "Atacante offline" is not published as "Atacante offline (offline)" while a
 * lane titled "The thief in the workshop" still keeps its classification.
 *
 * Dropped on purpose: `ariaLabel`, a prose summary of the same lanes written
 * for a reader who cannot see them.
 */
const LABEL = {
  en: {
    rate: "Rate",
    can: "Can",
    cannot: "Cannot",
    stoppedBy: "Stopped by",
  },
  es: {
    rate: "Ritmo",
    can: "Puede",
    cannot: "No puede",
    stoppedBy: "Lo detiene",
  },
} as const;

interface Lane {
  kind?: string;
  title?: string;
  subtitle?: string;
  rate?: string;
  can?: string[];
  cannot?: string[];
  stoppedBy?: string;
}

/** A bullet whose sub-items are nested one level under it. */
const bulletList = (label: string, items: string[]): string =>
  [`- ${label}:`, ...items.map((item) => `  - ${line(item)}`)].join("\n");

export default markdownFor({
  tag: "AttackSurfaceMatrix",
  toMarkdown(node, ctx) {
    const lanes = ctx.expr<Lane[]>(node, "lanes");
    if (!Array.isArray(lanes) || lanes.length === 0) return ctx.body(node);

    const label = LABEL[ctx.locale];
    const blocks = lanes.map((lane) => {
      const kind = line(lane?.kind);
      const title = line(lane?.title);
      const redundant =
        kind === "" || title.toLowerCase().includes(kind.toLowerCase());
      const heading = [
        `**${title}**`,
        redundant ? "" : `(${kind})`,
        lane?.subtitle ? `— ${line(lane.subtitle)}` : "",
      ]
        .filter(Boolean)
        .join(" ");

      const rows: string[] = [];
      if (lane?.rate) rows.push(`- ${label.rate}: ${line(lane.rate)}`);
      if (lane?.can?.length) rows.push(bulletList(label.can, lane.can));
      if (lane?.cannot?.length)
        rows.push(bulletList(label.cannot, lane.cannot));
      if (lane?.stoppedBy)
        rows.push(`- ${label.stoppedBy}: ${line(lane.stoppedBy)}`);

      return `${heading}\n\n${rows.join("\n")}`;
    });

    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [title ? `**${title}**` : "", ...blocks, caption ?? ""]
      .filter(Boolean)
      .join("\n\n");
  },
});
