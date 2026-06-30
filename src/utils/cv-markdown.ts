/**
 * Web-side re-export of the inline-markdown HTML renderer.
 *
 * The renderer itself lives in `scripts/cv/inline-markdown.mjs` so it can be
 * shared with the ATS LaTeX generator (plain Node). This thin wrapper exposes the
 * HTML variant to the Astro CV components via the `@utils` alias.
 *
 * @module
 */

export { markdownToHtml } from "../../scripts/cv/inline-markdown.mjs";
