import { markdownFor } from "@utils/llms/mdx/types";

/**
 * A stack of gates that all drain to one shared failure. The gates are just a
 * list and convert cleanly, but the *shape* — pass flows down to the next
 * gate, failing ANY gate diverts to the same fail-closed sink — is drawn with
 * arrows and boxes and exists nowhere in the props. Emitting the gates alone
 * would publish a checklist and lose the fail-closed guarantee, which is the
 * entire reason the diagram is in the post. So the structure is stated in one
 * sentence (the component's own aria wording, minus its "{title}: " prefix)
 * and the two outcomes are spelled out under the list.
 *
 * The chrome wording is the component's own `gauntlet.*` strings, copied
 * rather than imported: these modules keep their visible strings local.
 *
 * Dropped on purpose: the author's `ariaLabel`. Unlike the one-line structural
 * sentence, it re-enumerates every gate in prose — the list right above it.
 */
const LABEL = {
  en: {
    structure: (count: number) =>
      `${count} checks in order; any failure fails closed, all passing returns the result.`,
    onPass: "On pass",
    onFailure: "On failure",
    rejectTag: "any failure",
  },
  es: {
    structure: (count: number) =>
      `${count} comprobaciones en orden; cualquier fallo se bloquea ante el fallo, y si todas pasan se devuelve el resultado.`,
    onPass: "Si pasa",
    onFailure: "Si falla",
    rejectTag: "cualquier fallo",
  },
} as const;

interface Gate {
  label?: string;
  detail?: string;
}

/** Collapses a value to a single line for use inside a list item. */
const line = (value: string | undefined): string =>
  (value ?? "").replaceAll(/\s*\n\s*/gu, " ").trim();

/** "**label** — detail", or just the label when there is no detail. */
const titled = (
  label: string | undefined,
  detail: string | undefined,
): string => {
  const head = `**${line(label)}**`;
  return detail ? `${head} — ${line(detail)}` : head;
};

export default markdownFor({
  tag: "Gauntlet",
  toMarkdown(node, ctx) {
    const steps = ctx.expr<Gate[]>(node, "steps");
    const reject = ctx.expr<Gate>(node, "reject");
    const pass = ctx.expr<Gate>(node, "pass");
    if (!Array.isArray(steps) || steps.length === 0) return ctx.body(node);

    const label = LABEL[ctx.locale];
    const gates = steps.map(
      (gate, index) => `${index + 1}. ${titled(gate?.label, gate?.detail)}`,
    );
    const tag = ctx.attr(node, "rejectTag") ?? label.rejectTag;
    const outcomes = [
      pass?.label
        ? `- ${label.onPass}: ${titled(pass.label, pass.detail)}`
        : "",
      reject?.label
        ? `- ${label.onFailure} (${tag}): ${titled(reject.label, reject.detail)}`
        : "",
    ].filter(Boolean);

    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [
      title ? `**${title}**` : "",
      label.structure(steps.length),
      gates.join("\n"),
      outcomes.join("\n"),
      caption ?? "",
    ]
      .filter(Boolean)
      .join("\n\n");
  },
});
