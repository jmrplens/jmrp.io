import { markdownFor, type MdxNode } from "@utils/llms/mdx/types";

/**
 * A tab group is N parallel blocks of which the page shows exactly one. Both
 * obvious conversions are wrong: emitting only the first panel silently
 * deletes the iptables and firewalld variants of a firewall step that the
 * ufw panel does not contain, and emitting all of them unlabelled turns three
 * mutually exclusive install procedures into one contradictory recipe. So
 * every panel is emitted, and every panel keeps its label.
 *
 * The header also carries `i/N`, which is the one thing a panel cannot state
 * about itself: how many siblings it has and where the group ends. Without it
 * a chunk that starts mid-group looks identical to a `Callout` or a
 * `Collapsible`, both of which also lead with a bold line.
 *
 * "Option" overstates the case for the 2 groups (of 10 in the corpus) whose
 * tabs are facets rather than choices — the five CSP directives, the three
 * stages of one policy. The alternative, a purely structural `[2/4]`, states
 * membership but never exclusivity, and the exclusive groups are the majority
 * and the dangerous ones: concatenating three ways to install Nginx breaks a
 * server, while reading five directives as if they were choices does not.
 *
 * Panels are rendered here rather than delegated to `TabPanel.md.ts` because
 * the index only exists at this level.
 */
const OPTION = { en: "Option", es: "Opción" } as const;

export default markdownFor({
  tag: "Tabs",
  toMarkdown(node, ctx) {
    const children = node.children ?? [];
    const isPanel = (child: MdxNode) => child.name === "TabPanel";
    const total = children.filter((child) => isPanel(child)).length;
    if (total === 0) return ctx.body(node);

    const parts: string[] = [];
    let index = 0;
    for (const child of children) {
      if (!isPanel(child)) {
        // Stray content between panels: keep it, it is on the page too.
        const rendered = ctx.render(child);
        if (rendered.trim() !== "") parts.push(rendered);
        continue;
      }
      index += 1;
      const label = ctx.attr(child, "label");
      const position = `${OPTION[ctx.locale]} ${index}/${total}`;
      const heading = label ? `${position} — ${label}` : position;
      parts.push(`**${heading}**\n\n${ctx.body(child)}`);
    }
    return parts.join("\n\n");
  },
});
