/**
 * Tests for the diff size read aloud on /projects/contributions/: each count
 * agrees in number with its own noun, where one template read "1 lines added"
 * and, in Spanish, "y 1 eliminadas" (GEO audit #11, B5).
 *
 * `diffSpoken` is the composition `diffSizeText` runs, loaded from its leaf
 * module and fed the real strings. Only the three locale services are stand-
 * ins, because `@i18n/utils` resolves through the project's path aliases:
 * `text` fills placeholders as `t()` does, `plural` picks a form as
 * `pluralize` does, and `format` is the `Intl.NumberFormat` `formatNumber`
 * wraps.
 */
// Half of the expected strings are Spanish, by design.
// cspell:locale es,en
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { common as en } from "../../src/i18n/translations/en/common.ts";
import { common as es } from "../../src/i18n/translations/es/common.ts";
import { diffSpoken } from "../../src/utils/llms/diff-spoken.ts";

const LOCALES = {
  en: { strings: en.pages.projectsContributions, bcp47: "en-US" },
  es: { strings: es.pages.projectsContributions, bcp47: "es-ES" },
};

/**
 * The locale services `diffSizeText` passes in, built on the real strings.
 * @param {"en" | "es"} locale - Which locale.
 * @returns {import("../../src/utils/llms/diff-spoken.ts").DiffSpokenLocale}
 *   The lookup, plural rule and number format.
 */
function services(locale) {
  const { strings, bcp47 } = LOCALES[locale];
  const rules = new Intl.PluralRules(bcp47);
  const numbers = new Intl.NumberFormat(bcp47);
  return {
    text: (key, params) =>
      strings[key].replaceAll(/\{(\w+)\}/gu, (match, name) =>
        name in params ? String(params[name]) : match,
      ),
    plural: (count, forms) => forms[rules.select(count)] ?? forms.other,
    format: (count) => numbers.format(count),
  };
}

/**
 * The spoken size for one locale.
 * @param {"en" | "es"} locale - Which locale.
 * @param {number} additions - Lines added.
 * @param {number} deletions - Lines removed.
 * @returns {string} The sentence a screen reader hears.
 */
const spoken = (locale, additions, deletions) =>
  diffSpoken(additions, deletions, services(locale));

describe("diff size read aloud", () => {
  it("uses the singular for one line in English", () => {
    assert.equal(spoken("en", 1, 1), "1 line added and 1 removed");
    assert.equal(spoken("en", 162, 29), "162 lines added and 29 removed");
  });

  it("uses the singular for one line in Spanish", () => {
    assert.equal(spoken("es", 1, 1), "1 línea añadida y 1 eliminada");
    assert.equal(spoken("es", 162, 29), "162 líneas añadidas y 29 eliminadas");
  });

  it("uses the plural for zero lines in both locales", () => {
    assert.equal(spoken("en", 0, 3), "0 lines added and 3 removed");
    assert.equal(spoken("es", 0, 3), "0 líneas añadidas y 3 eliminadas");
  });

  it("keeps additions and deletions apart when only one is singular", () => {
    assert.equal(spoken("en", 1, 29), "1 line added and 29 removed");
    assert.equal(spoken("es", 162, 1), "162 líneas añadidas y 1 eliminada");
  });

  it("formats each count as the locale writes it", () => {
    assert.equal(
      spoken("en", 12_345, 1000),
      "12,345 lines added and 1,000 removed",
    );
    assert.equal(
      spoken("es", 12_345, 1000),
      "12.345 líneas añadidas y 1000 eliminadas",
    );
  });
});
