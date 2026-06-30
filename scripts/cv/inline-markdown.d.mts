/** Type declarations for the inline-markdown renderer (see inline-markdown.mjs). */

/**
 * Escapes LaTeX special characters in a plain-text string.
 *
 * @param text - Raw text (coerced to string).
 * @returns The LaTeX-safe text.
 */
export function escapeLatex(text: unknown): string;

/**
 * Escapes the characters that break a hyperref URL argument.
 *
 * @param url - The destination URL.
 * @returns The URL safe to use inside a LaTeX `\href` argument.
 */
export function escapeLatexUrl(url: string): string;

/**
 * Renders inline markdown to LaTeX. Relative URLs are resolved against jmrp.io.
 *
 * @param md - The markdown string.
 * @returns The LaTeX string.
 */
export function markdownToLatex(md: unknown): string;

/**
 * Renders inline markdown to HTML. Relative URLs are kept relative.
 *
 * @param md - The markdown string.
 * @returns The HTML string.
 */
export function markdownToHtml(md: unknown): string;
