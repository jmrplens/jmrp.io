import { markdownFor } from "@utils/llms/mdx/types";

/**
 * A fixed comparison of regex features across JavaScript, PCRE and Python.
 * It takes no props: every cell lives inside the component, so the MDX says
 * only `<RegexFlavorTable />` and a converter that drops the tag publishes a
 * regex tool page with the flavor differences missing entirely. The table is
 * therefore mirrored here — it is reference data a model can actually answer
 * from ("does JavaScript support atomic groups?"), not chrome.
 *
 * Cells that are the same in both locales (the syntax itself) are written
 * once; only the prose cells carry an `{ en, es }` pair, which keeps the two
 * languages from drifting apart cell by cell.
 *
 * Faithful, not corrected: several cells are hardcoded English in the
 * component and therefore appear in English on the Spanish page too — "or",
 * "(with `u` flag)", "(built-in)", "Via `regex` module". They are reproduced
 * as the page renders them rather than silently translated here.
 *
 * Kept in step with `RegexFlavorTable.astro` and the `tools.regexFlavorTable.*`
 * strings; there is no way to derive it, since the component is markup.
 */
type Cell = string | { en: string; es: string };

const NOT_SUPPORTED: Cell = { en: "Not supported", es: "No soportado" };
const FIXED_ONLY: Cell = { en: "Fixed-length only", es: "Solo longitud fija" };

const HEAD: Cell[] = [
  { en: "Feature", es: "Característica" },
  "JavaScript",
  "PCRE (grep -P, PHP)",
  "Python re",
];

const ROWS: Cell[][] = [
  [
    { en: "Named groups", es: "Grupos con nombre" },
    "`(?<name>...)`",
    "`(?P<name>...)` or `(?<name>...)`",
    "`(?P<name>...)`",
  ],
  [
    "Lookbehind",
    { en: "Variable-length (ES2018+)", es: "Longitud variable (ES2018+)" },
    FIXED_ONLY,
    FIXED_ONLY,
  ],
  [
    { en: "Unicode properties", es: "Propiedades Unicode" },
    "`\\p{L}` (with `u` flag)",
    "`\\p{L}` (built-in)",
    "Via `regex` module",
  ],
  [
    { en: "Atomic groups", es: "Grupos atómicos" },
    NOT_SUPPORTED,
    "`(?>...)`",
    NOT_SUPPORTED,
  ],
  [
    { en: "Recursion", es: "Recursión" },
    NOT_SUPPORTED,
    "`(?R)`, `(?1)`",
    "Via `regex` module",
  ],
  [
    { en: "Possessive quantifiers", es: "Cuantificadores posesivos" },
    NOT_SUPPORTED,
    "`a++`, `a*+`",
    NOT_SUPPORTED,
  ],
  [
    {
      en: "Backreference in replace",
      es: "Retro-referencia en reemplazo",
    },
    "`$1`, `$&`",
    "`\\1`, `$1`",
    "`\\1`, `\\g<1>`",
  ],
];

export default markdownFor({
  tag: "RegexFlavorTable",
  toMarkdown(_node, ctx) {
    const cell = (value: Cell): string =>
      typeof value === "string" ? value : value[ctx.locale];
    const row = (cells: Cell[]): string => `| ${cells.map(cell).join(" | ")} |`;
    return [
      row(HEAD),
      `| ${HEAD.map(() => "---").join(" | ")} |`,
      ...ROWS.map(row),
    ].join("\n");
  },
});
