import { markdownFor } from "@utils/llms/mdx/types";

/** One labelled input to a merge stage. */
interface MergeInput {
  name?: string;
  role?: string;
}

/** One combine step: inputs → operation → output. */
interface MergeStage {
  op?: string;
  inputs?: MergeInput[];
  out?: { name?: string; note?: string };
}

/**
 * Each stage is an equation — inputs, the operation that combines them, and the
 * single output that carries into the next stage — so it is written as one:
 * `HKDF-Extract: deviceSecret (salt) + master (IKM) → PRK`.
 *
 * The `role` tags are kept and stay attached to their input, because in a KDF
 * they are the argument names: swapping which operand is the salt and which is
 * the IKM changes the construction, and a bare list of two names would not say
 * which is which.
 */
export default markdownFor({
  tag: "MergeFlow",
  toMarkdown(node, ctx) {
    const stages = ctx.expr<MergeStage[]>(node, "stages");
    if (!Array.isArray(stages) || stages.length === 0) return ctx.body(node);

    const lines = stages.map((stage) => {
      const inputs = (stage?.inputs ?? [])
        .map((input) => {
          const role = input?.role ? ` (${input.role})` : "";
          return `\`${input?.name ?? ""}\`${role}`;
        })
        .join(" + ");
      const note = stage?.out?.note ? ` (${stage.out.note})` : "";
      const out = `\`${stage?.out?.name ?? ""}\`${note}`;
      return `- \`${stage?.op ?? ""}\`: ${inputs} → ${out}`;
    });

    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [title ? `**${title}**` : "", lines.join("\n"), caption ?? ""]
      .filter(Boolean)
      .join("\n\n");
  },
});
