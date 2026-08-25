import { markdownFor } from "@utils/llms/mdx/types";

/**
 * A numbered walk through an exploit. It is already an ordered list on the
 * page, so the steps survive as one — the part that does not survive is
 * `kind`, which is rendered as an accent colour plus an icon. That is the
 * component's whole editorial claim: which steps are the attacker moving,
 * which one leaks information, and which one is where the design stops them.
 * Each kind becomes the word the component hides in its `.sr-only` table
 * ("information leaked", "blocked by design"), so the reader can tell the
 * defence step from the attack steps without seeing a green shield.
 *
 * The kind wording is the component's own `attackTimeline.*` strings, copied
 * rather than imported: these modules keep their visible strings local.
 *
 * `note` is emitted as a lazy continuation line under its step rather than a
 * separate paragraph, so it stays inside the numbered item.
 *
 * Dropped on purpose: `ariaLabel`, which walks the same steps in prose for a
 * reader who cannot see them.
 */
const KIND = {
  en: {
    attacker: "attacker action",
    loop: "repeated step",
    leak: "information leaked",
    blocked: "blocked by design",
  },
  es: {
    attacker: "acción del atacante",
    loop: "paso repetido",
    leak: "información filtrada",
    blocked: "bloqueado por diseño",
  },
} as const;

interface Step {
  text?: string;
  kind?: string;
  note?: string;
}

/** Collapses a value to a single line for use inside a list item. */
const line = (value: string | undefined): string =>
  (value ?? "").replaceAll(/\s*\n\s*/gu, " ").trim();

export default markdownFor({
  tag: "AttackTimeline",
  toMarkdown(node, ctx) {
    const steps = ctx.expr<Step[]>(node, "steps");
    if (!Array.isArray(steps) || steps.length === 0) return ctx.body(node);

    const kinds = KIND[ctx.locale];
    const items = steps.map((step, index) => {
      // The component defaults an absent kind to "attacker".
      const key = (step?.kind ?? "attacker") as keyof typeof kinds;
      const kind = kinds[key] ?? kinds.attacker;
      const note = step?.note ? `\n   ${line(step.note)}` : "";
      return `${index + 1}. **${kind}** — ${line(step?.text)}${note}`;
    });

    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [title ? `**${title}**` : "", items.join("\n"), caption ?? ""]
      .filter(Boolean)
      .join("\n\n");
  },
});
