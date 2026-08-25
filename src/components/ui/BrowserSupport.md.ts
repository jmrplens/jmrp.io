import { markdownFor } from "@utils/llms/mdx/types";

/**
 * A compatibility grid of per-browser cards. Two of its four fields are not
 * text on the page at all: `browser` is an enum key (`"chrome"`) rendered as
 * a proper name, and `support` is a glyph — ✓ ⚠ ✕ ? — with the word hidden in
 * an `.sr-only` span. Both are expanded here, so a cell reads "Partial
 * support" instead of a symbol whose meaning lives in a stylesheet.
 *
 * The version is printed `59+` exactly as the component does: the number is a
 * floor, not the version that was tested.
 *
 * The component's `browserNames` map is exactly a first-letter capitalization
 * of its five enum values, so that is applied as a rule instead of copied —
 * a table that cannot drift out of step with the component. An unrecognized
 * value passes through as the author wrote it.
 *
 * The support wording is the component's own `components.browserSupport.*`
 * strings, copied rather than imported: these modules keep their visible
 * strings local.
 */
const LABEL = {
  en: {
    title: "Browser Support",
    browser: "Browser",
    version: "Version",
    support: "Support",
    note: "Note",
    full: "Full Support",
    partial: "Partial Support",
    none: "No Support",
    unknown: "Unknown",
  },
  es: {
    title: "Compatibilidad del navegador",
    browser: "Navegador",
    version: "Versión",
    support: "Soporte",
    note: "Nota",
    full: "Soporte completo",
    partial: "Soporte parcial",
    none: "Sin soporte",
    unknown: "Desconocido",
  },
} as const;

const SUPPORT = ["full", "partial", "none", "unknown"] as const;

interface Browser {
  browser?: string;
  version?: string;
  support?: string;
  note?: string;
}

/** Anything a table cell can hold once the props have been read. */
type CellValue = string | number | undefined;

/** Markdown table cell: newlines flattened, pipes escaped. */
const cell = (value: CellValue): string =>
  String(value ?? "")
    .replaceAll(/\s*\n\s*/gu, " ")
    .replaceAll("|", String.raw`\|`)
    .trim();

/** A markdown table from a header row and body rows. */
const table = (head: string[], body: CellValue[][]): string =>
  [
    `| ${head.map(cell).join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ].join("\n");

export default markdownFor({
  tag: "BrowserSupport",
  toMarkdown(node, ctx) {
    const browsers = ctx.expr<Browser[]>(node, "browsers");
    if (!Array.isArray(browsers) || browsers.length === 0) {
      return ctx.body(node);
    }

    const label = LABEL[ctx.locale];
    const noted = browsers.some((entry) => entry?.note);
    const head: string[] = [label.browser, label.version, label.support];
    if (noted) head.push(label.note);

    const body = browsers.map((entry) => {
      const level = entry?.support ?? "";
      const support = (SUPPORT as readonly string[]).includes(level)
        ? label[level as (typeof SUPPORT)[number]]
        : label.unknown;
      const name = entry?.browser ?? "";
      const row: CellValue[] = [
        name.charAt(0).toUpperCase() + name.slice(1),
        entry?.version ? `${entry.version}+` : "",
        support,
      ];
      if (noted) row.push(entry?.note);
      return row;
    });

    // The component falls back to a translated title when none is given, and
    // the table is unreadable without one: it is the feature being supported.
    const title = ctx.attr(node, "title") ?? label.title;
    return `**${title}**\n\n${table(head, body)}`;
  },
});
