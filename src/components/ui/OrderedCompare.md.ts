import { markdownFor } from "@utils/llms/mdx/types";

/** One step of a lane, as written in the `left` / `right` prop. */
interface Step {
  text?: string;
  status?: "danger" | "safe" | "neutral";
  note?: string;
}

/** One of the two ordered lanes being compared. */
interface Lane {
  label?: string;
  verdict?: string;
  steps?: Step[];
}

/**
 * The whole component lives in its props — the tag is self-closing, so the
 * fail-safe emits absolutely nothing for it. What it draws is two numbered
 * lanes whose steps carry a safe/unsafe marker, and that ordering IS the
 * argument of the section it sits in: MAC-then-Encrypt decrypts before it
 * checks, Encrypt-then-MAC checks before it decrypts.
 *
 * Two ordered lists, not a two-column table: a table pairs the lanes row by
 * row and would assert a correspondence between step 2 of one path and step 2
 * of the other that the component never claims, and it breaks outright when
 * the lanes have different lengths.
 *
 * Each non-neutral step is prefixed with the status name the badge announces —
 * the authored `dangerLabel` / `safeLabel` when given, since an author only
 * overrides those to say something the glyph cannot. It repeats per step, as
 * the badge does for a screen reader; the alternative, a legend stated once,
 * saves a line and costs the marker its meaning wherever the output is
 * chunked.
 *
 * `ariaLabel` is discarded. It is the alt text of a picture, and it retells
 * the same steps in prose — keeping both would state every step twice.
 */
const TEXT = {
  en: { danger: "unsafe step", safe: "safe step" },
  es: { danger: "paso inseguro", safe: "paso seguro" },
} as const;

export default markdownFor({
  tag: "OrderedCompare",
  toMarkdown(node, ctx) {
    const t = TEXT[ctx.locale];
    const marker = {
      danger: ctx.attr(node, "dangerLabel") ?? t.danger,
      safe: ctx.attr(node, "safeLabel") ?? t.safe,
    };

    const lane = (side: "left" | "right"): string => {
      const data = ctx.expr<Lane>(node, side);
      if (!data) return "";
      const head = [data.label, data.verdict].filter(Boolean).join(" — ");
      const steps = (data.steps ?? []).map((step, index) => {
        const status = step.status ?? "neutral";
        const prefix = status === "neutral" ? "" : `**${marker[status]}:** `;
        const note = step.note ? ` (${step.note})` : "";
        return `${index + 1}. ${prefix}${step.text ?? ""}${note}`;
      });
      return [head ? `**${head}**` : "", steps.join("\n")]
        .filter(Boolean)
        .join("\n\n");
    };

    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [
      title ? `**${title}**` : "",
      lane("left"),
      lane("right"),
      caption ?? "",
    ]
      .filter(Boolean)
      .join("\n\n");
  },
});
