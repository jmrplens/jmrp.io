/**
 * Web-side re-export of the inline-markdown HTML renderer.
 *
 * The renderer itself lives in `scripts/cv/inline-markdown.mjs` so it can be
 * shared with the ATS LaTeX generator (plain Node). This thin wrapper exposes the
 * HTML variant to the Astro CV components via the `@utils` alias.
 *
 * @module
 */

import { markdownToHtml as render } from "../../scripts/cv/inline-markdown.mjs";

/**
 * Renders inline markdown to HTML.
 *
 * Restated here rather than re-exported straight from the `.mjs`: that file is
 * plain JavaScript shared with the LaTeX build, and a bare `export {}` of it
 * made `newTabNotice` read as an arity error at every call site. Declaring the
 * wrapper gives consumers a checked signature and one place to document it.
 *
 * @param md - The markdown string.
 * @param newTabNotice - Localized "(opens in new tab)", appended to the
 *   accessible name of every external link. Omit to keep the previous
 *   behavior, where only a link title produced a label.
 * @returns The HTML string.
 */
export const markdownToHtml = (md: unknown, newTabNotice = ""): string =>
  render(md, newTabNotice);
