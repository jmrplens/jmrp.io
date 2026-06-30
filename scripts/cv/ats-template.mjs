// This module emits LaTeX, where `{...}` braces are pervasive and not template
// interpolations; the lint rule below produces only false positives here.
/* eslint-disable unicorn/no-incorrect-template-string-interpolation */
/**
 * LaTeX template for the ATS CV generator.
 *
 * Provides the document preamble (parameterised by language + PDF metadata), the
 * header block and small section helpers. The preamble mirrors the hand-authored
 * ATS `.tex` that was already verified to extract cleanly (LuaLaTeX + Inter with
 * `WordSpace=1.15` and `RawFeature={-tlig}`, accent = brand purple, tagged PDF).
 *
 * @module
 */

import { escapeLatex, escapeLatexUrl } from "./inline-markdown.mjs";

/**
 * Builds the LaTeX preamble (everything up to and including the helper command
 * definitions, but excluding `\begin{document}`).
 *
 * @param {object} opts - Options.
 * @param {string} opts.babelLang - babel language option (e.g. "spanish", "english").
 * @param {string} opts.docLang - BCP-47 language for PDF metadata (e.g. "es-ES").
 * @param {string} opts.pdfTitle - PDF title metadata.
 * @param {string} opts.pdfSubject - PDF subject metadata.
 * @param {string} opts.pdfKeywords - PDF keywords metadata.
 * @returns {string} The preamble LaTeX.
 */
export function documentPreamble({
  babelLang,
  docLang,
  pdfTitle,
  pdfSubject,
  pdfKeywords,
}) {
  const babelOptions =
    babelLang === "spanish" ? "spanish,es-noindentfirst" : babelLang;
  return String.raw`% =====================================================================
%  CV — José Manuel Requena Plens — Versión ATS
%  GENERADO automáticamente desde src/content/cv/{es,en}.yaml.
%  NO editar a mano: los cambios se sobrescriben. Editar el YAML + el generador
%  (scripts/cv/generate-ats.mjs). Motor: LuaLaTeX + fontspec.
% =====================================================================
\DocumentMetadata{lang=${docLang}, pdfversion=2.0, testphase={phase-III}}
\documentclass[11pt,a4paper]{article}

% ---- Codificación / idioma ----
\usepackage{fontspec}
\usepackage[${babelOptions}]{babel}
\usepackage{microtype}

% ---- Geometría (márgenes ajustados pero legibles) ----
\usepackage[a4paper,top=1.2cm,bottom=1.1cm,left=1.5cm,right=1.5cm]{geometry}

% ---- Color (un solo acento = morado de jmrp.io) ----
\usepackage{xcolor}
\definecolor{accent}{HTML}{B509AC}     % morado de marca (light theme)
\definecolor{ink}{HTML}{1F2328}        % texto principal (casi negro)
\definecolor{muted}{HTML}{57606A}      % texto secundario

% ---- Tipografía: Inter ----
\setmainfont{Inter}[
  UprightFont = *-Regular,
  BoldFont    = *-SemiBold,
  ItalicFont  = *-Italic,
  BoldItalicFont = *-SemiBoldItalic,
  WordSpace   = 1.15,        % ensancha el espacio entre palabras: extracción ATS más robusta
  RawFeature  = {-tlig},     % apóstrofo/comillas rectos (mejor extracción ATS)
]
\newfontfamily\headingfont{Inter}[UprightFont=*-Bold]
\color{ink}

% ---- Listas compactas ----
\usepackage{enumitem}
\setlist[itemize]{
  leftmargin=1.1em, topsep=1pt, partopsep=0pt, parsep=0pt, itemsep=1pt,
  label=\small\textcolor{accent}{\textbullet}
}

% ---- Secciones (versalitas + regla fina en acento) ----
\usepackage{titlesec}
\titleformat{\section}
  {\headingfont\large\color{accent}}
  {}{0em}{}[\vspace{-0.55em}{\color{accent}\rule{\linewidth}{0.8pt}}]
\titlespacing*{\section}{0pt}{0.45em}{0.35em}

% Evita encabezados de sección huérfanos al final de página.
\usepackage{needspace}
\let\jmrpsection\section
\renewcommand{\section}[1]{\needspace{4\baselineskip}\jmrpsection{#1}}

% ---- Enlaces ----
\usepackage[hidelinks]{hyperref}
\hypersetup{
  colorlinks=true, urlcolor=accent, linkcolor=accent,
  pdftitle={${escapeLatex(pdfTitle)}},
  pdfauthor={José Manuel Requena Plens},
  pdfsubject={${escapeLatex(pdfSubject)}},
  pdfkeywords={${escapeLatex(pdfKeywords)}},
  pdflang={${docLang}},
}
\usepackage{fontawesome5}

% ---- Interlineado ----
\linespread{1.02}
\setlength{\parindent}{0pt}

% =====================================================================
%  Comandos de ayuda
% =====================================================================
% Entrada de experiencia/formación: {cargo}{organización}{lugar}{fechas}
\newcommand{\cventry}[4]{%
  \textbf{#1}\hfill\textbf{#4}\par
  {\color{muted}\textit{#2}\hfill\textit{#3}}\par
  \vspace{2pt}
}
% Proyecto: {nombre}{stack}{métricas}. Métricas en su propia línea a la
% izquierda (no \hfill a la derecha) para que la extracción ATS vea una sola columna.
\newcommand{\cvproject}[3]{%
  \textbf{#1}\,\textcolor{muted}{\small— #2}\par
  {\small\textcolor{accent}{#3}}\par
  \vspace{1pt}
}
% Skill: {categoría}{items}
\newcommand{\cvskill}[2]{\textbf{#1:} #2\par\vspace{2pt}}
% Subencabezado dentro de una sección (p.ej. categoría de certificados)
\newcommand{\cvsubhead}[1]{\vspace{2pt}{\color{ink}\textbf{#1}}\par\vspace{1pt}}
% Divisor inline. Sin \raisebox: un bullet elevado obtiene una línea base
% distinta y los extractores PDF lo leen como una "línea" suelta de un solo
% "•" → rompe la heurística de una sola columna. En la línea base se agrupa bien.
\newcommand{\divider}{\textcolor{muted}{\ \scriptsize\textbullet\ }}
`;
}

/**
 * Builds the header block: name, headline, contact line and rule.
 *
 * @param {object} opts - Options.
 * @param {string} opts.name - Full name.
 * @param {string} opts.headline - Job-title headline.
 * @param {{text: string, url?: string}[]} opts.contactParts - Contact items joined by dividers.
 * @param {string} [opts.availability] - Optional availability line under the contact row.
 * @returns {string} The header LaTeX.
 */
export function headerBlock({ name, headline, contactParts, availability }) {
  const contact = contactParts
    .map((part) =>
      part.url
        ? String.raw`\href{${escapeLatexUrl(part.url)}}{${escapeLatex(part.text)}}`
        : escapeLatex(part.text),
    )
    .join(" \\divider\n");

  const availabilityLine = availability
    ? `\\vspace{2pt}\n{\\small\\color{muted}${escapeLatex(availability)}}\\par\n`
    : "";

  return String.raw`\begin{document}

% =====================================================================
%  ENCABEZADO
% =====================================================================
{\headingfont\fontsize{22pt}{24pt}\selectfont ${escapeLatex(name)}}\par
\vspace{2pt}
{\large\color{accent}${escapeLatex(headline)}}\par
\vspace{4pt}
{\small\color{muted}%
${contact}%
}\par
${availabilityLine}\vspace{2pt}
{\color{accent}\rule{\linewidth}{1.2pt}}
`;
}

/**
 * Renders a `\section{}` heading line.
 *
 * @param {string} title - The section title (plain text).
 * @returns {string} The `\section{}` LaTeX line.
 */
export function sectionTitle(title) {
  return `\n\\section{${escapeLatex(title)}}\n`;
}

/**
 * Closes the LaTeX document.
 *
 * @returns {string} The `\end{document}` line.
 */
export function documentEnd() {
  return "\n\\end{document}\n";
}
