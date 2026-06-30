/**
 * Inline-markdown renderer shared by the CV web parser and the ATS generator.
 *
 * The CV YAML (`src/content/cv/{es,en}.yaml`) stores rich text as a tiny inline
 * markdown subset — no HTML — so a single source feeds both the website (→ HTML)
 * and the LaTeX ATS PDFs (→ LaTeX):
 *
 *   - `[text](url)` or `[text](url "aria label")` → link (the optional title
 *     becomes the HTML `aria-label`; LaTeX ignores it).
 *   - `**bold**`   → bold.
 *   - `*italic*`   → italic.
 *
 * Everything else is literal text, escaped for the target format. This module is
 * dependency-free and unit-tested (`inline-markdown.test.mjs`).
 *
 * @module
 */

const BASE_URL = "https://jmrp.io";

/** Matches one inline token: link `[text](dest)`, bold `**x**`, or italic `*x*`. */
// NOSONAR: negated char-classes are linear (no catastrophic backtracking); inputs are short, trusted CV strings.
const TOKEN = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g; // NOSONAR

/** Splits a link destination into URL and optional title: `url "title"`. */
const LINK_DEST = /^(\S+)(?:\s+"([^"]*)")?$/;

/** Per-character LaTeX escapes for text nodes. */
const LATEX_ESCAPES = {
  "\\": String.raw`\textbackslash{}`,
  "&": String.raw`\&`,
  "%": String.raw`\%`,
  $: String.raw`\$`,
  "#": String.raw`\#`,
  _: String.raw`\_`,
  "{": String.raw`\{`,
  "}": String.raw`\}`,
  "~": String.raw`\textasciitilde{}`,
  "^": String.raw`\textasciicircum{}`,
};

/**
 * Escapes LaTeX special characters in a plain-text string.
 *
 * @param {unknown} text - Raw text (coerced to string).
 * @returns {string} The LaTeX-safe text.
 */
export function escapeLatex(text) {
  let out = "";
  for (const ch of typeof text === "string" ? text : "") {
    out += LATEX_ESCAPES[ch] ?? ch;
  }
  return out;
}

/** Escapes the characters that break a hyperref URL argument. */
export function escapeLatexUrl(url) {
  return url
    .replaceAll("\\", "\\\\")
    .replaceAll("%", String.raw`\%`)
    .replaceAll("#", String.raw`\#`);
}

/** Escapes HTML text content. */
function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Escapes an HTML attribute value. */
function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

/** Allowlists safe href schemes (blocks javascript:/data: in injected HTML). */
function isSafeHref(url) {
  return /^(https?:|mailto:)/i.test(url) || url.startsWith("/");
}

/**
 * Walks the inline tokens of a markdown string, calling the renderer callbacks.
 *
 * @param {string} md - The markdown string.
 * @param {object} render - Renderer callbacks.
 * @param {(t: string) => string} render.text - Plain text.
 * @param {(text: string, url: string, title?: string) => string} render.link - Link.
 * @param {(text: string) => string} render.bold - Bold.
 * @param {(text: string) => string} render.italic - Italic.
 * @returns {string} The rendered string.
 */
function walk(md, render) {
  let out = "";
  let last = 0;
  for (const m of md.matchAll(TOKEN)) {
    if (m.index > last) out += render.text(md.slice(last, m.index));
    if (m[1] !== undefined) {
      const dest = LINK_DEST.exec(m[2].trim());
      out += render.link(m[1], dest?.[1] ?? m[2].trim(), dest?.[2]);
    } else if (m[3] !== undefined) out += render.bold(m[3]);
    else if (m[4] !== undefined) out += render.italic(m[4]);
    last = m.index + m[0].length;
  }
  if (last < md.length) out += render.text(md.slice(last));
  return out;
}

/**
 * Renders inline markdown to LaTeX. Relative URLs are resolved against jmrp.io.
 *
 * @param {unknown} md - The markdown string.
 * @returns {string} The LaTeX string.
 */
export function markdownToLatex(md) {
  if (typeof md !== "string" || md === "") return "";
  return walk(md, {
    text: escapeLatex,
    link: (text, url) => {
      const resolved = url.startsWith("/") ? BASE_URL + url : url;
      return String.raw`\href{${escapeLatexUrl(resolved)}}{${escapeLatex(text)}}`;
    },
    bold: (text) => String.raw`\textbf{${escapeLatex(text)}}`,
    italic: (text) => String.raw`\textit{${escapeLatex(text)}}`,
  });
}

/**
 * Renders inline markdown to HTML. Relative URLs are kept relative (the site
 * serves them from root); the optional link title becomes `aria-label`.
 *
 * @param {unknown} md - The markdown string.
 * @returns {string} The HTML string.
 */
export function markdownToHtml(md) {
  if (typeof md !== "string" || md === "") return "";
  return walk(md, {
    text: escapeHtml,
    link: (text, url, title) => {
      // Drop the link (keep the text) when the scheme isn't allowlisted.
      if (!isSafeHref(url)) return escapeHtml(text);
      const aria = title ? ` aria-label="${escapeAttr(title)}"` : "";
      return `<a href="${escapeAttr(url)}" target="_blank" rel="external noopener noreferrer"${aria}>${escapeHtml(text)}</a>`;
    },
    bold: (text) => `<strong>${escapeHtml(text)}</strong>`,
    italic: (text) => `<em>${escapeHtml(text)}</em>`,
  });
}
