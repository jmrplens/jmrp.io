import { markdownFor } from "@utils/llms/mdx/types";

/**
 * Every StateNotice in the corpus is self-closing: the feature name, its
 * state, the deadline and the replacement are all props, and the body is
 * empty. Dropping the tag therefore deletes the notice outright — the reader
 * would go from "here is how to configure `report-uri`" straight to the next
 * section with nothing saying the directive is deprecated.
 *
 * The sentence the component assembles from those props is rebuilt here in the
 * same words, because `type` is an assertion about the surrounding prose that
 * the prose does not repeat. `alternativeUrl` becomes a real markdown link:
 * "use `report-to` instead" is worth more with the spec behind it.
 *
 * Kept: title, type, feature, removal date, alternative (+ link), body.
 * Dropped: nothing.
 */
const TEXT = {
  en: {
    label: {
      deprecated: "Deprecated",
      mandatory: "Mandatory",
      experimental: "Experimental",
      preview: "Preview",
      breaking: "Breaking Change",
      security: "Security",
    },
    state: {
      deprecated: "is deprecated",
      mandatory: "is required",
      experimental: "is experimental",
      preview: "is in preview",
      breaking: "introduces breaking changes",
      security: "has security implications",
    },
    date: {
      deprecated: "and will be removed in",
      mandatory: "effective from",
      experimental: "— target:",
      preview: "— target:",
      breaking: "effective from",
      security: "— mitigation required by",
    },
    useInstead: "Use instead:",
    recommended: "Recommended:",
  },
  es: {
    label: {
      deprecated: "Obsoleto",
      mandatory: "Obligatorio",
      experimental: "Experimental",
      preview: "Vista previa",
      breaking: "Cambio importante",
      security: "Seguridad",
    },
    state: {
      deprecated: "está obsoleto",
      mandatory: "es obligatorio",
      experimental: "es experimental",
      preview: "está en vista previa",
      breaking: "introduce cambios importantes",
      security: "tiene implicaciones de seguridad",
    },
    date: {
      deprecated: "y se eliminará en",
      mandatory: "vigente desde",
      experimental: "— objetivo:",
      preview: "— objetivo:",
      breaking: "vigente desde",
      security: "— mitigación requerida antes de",
    },
    useInstead: "Usar en su lugar:",
    recommended: "Recomendado:",
  },
} as const;

type NoticeType = keyof (typeof TEXT)["en"]["label"];

export default markdownFor({
  tag: "StateNotice",
  toMarkdown(node, ctx) {
    const words = TEXT[ctx.locale];
    const raw = ctx.attr(node, "type") ?? "deprecated";
    const type: NoticeType =
      raw in words.label ? (raw as NoticeType) : "deprecated";

    const title = ctx.attr(node, "title");
    const label = words.label[type];
    const blocks = [title ? `**${label} — ${title}**` : `**${label}**`];

    const feature = ctx.attr(node, "feature");
    if (feature) {
      const removalDate = ctx.attr(node, "removalDate");
      const deadline = removalDate ? ` ${words.date[type]} ${removalDate}` : "";
      blocks.push(`\`${feature}\` ${words.state[type]}${deadline}.`);
    }

    const alternative = ctx.attr(node, "alternative");
    if (alternative) {
      // "Use instead" only reads right for a replacement; the other five types
      // are recommending, not replacing — the component makes the same split.
      const lead = type === "deprecated" ? words.useInstead : words.recommended;
      const url = ctx.attr(node, "alternativeUrl");
      const target = url
        ? `[\`${alternative}\`](${url})`
        : `\`${alternative}\``;
      blocks.push(`${lead} ${target}`);
    }

    const body = ctx.body(node);
    if (body.trim() !== "") blocks.push(body);

    return blocks.join("\n\n");
  },
});
