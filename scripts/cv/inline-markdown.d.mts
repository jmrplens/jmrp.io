/**
 * Types for the inline-markdown renderer.
 *
 * The implementation is plain JavaScript (`inline-markdown.mjs`) because the
 * ATS LaTeX generator runs it under bare Node, outside the Astro/TypeScript
 * build. Its JSDoc is enough for editors but not for `astro check`, which read
 * only the first parameter across the module boundary and reported an arity
 * error wherever `newTabNotice` was passed — while ESLint's program inferred
 * the full signature and called the compensating cast unnecessary. Declaring
 * the types here is what makes both tools agree.
 */

/**
 * Renders inline markdown to HTML.
 *
 * @param md - The markdown string; a non-string yields "".
 * @param newTabNotice - Localized "(opens in new tab)", appended to the
 *   accessible name of every external link so it announces itself (WCAG 3.2.5).
 *   Omit it to keep the older behavior, where only a link title produced a
 *   label at all — that is what the LaTeX caller wants.
 * @returns The rendered HTML.
 */
export function markdownToHtml(md: unknown, newTabNotice?: string): string;

/**
 * Renders inline markdown to LaTeX.
 *
 * @param md - The markdown string; a non-string yields "".
 * @returns The rendered LaTeX.
 */
export function markdownToLatex(md: unknown): string;

/**
 * Escapes text for a LaTeX document body.
 *
 * @param text - Raw text.
 * @returns The escaped text.
 */
export function escapeLatex(text: string): string;

/**
 * Escapes a URL for use inside a LaTeX \href.
 *
 * @param url - Raw URL.
 * @returns The escaped URL.
 */
export function escapeLatexUrl(url: string): string;
