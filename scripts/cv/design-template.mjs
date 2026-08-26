// This module emits LaTeX, where `{...}` braces are pervasive and not template
// interpolations; the lint rule below produces only false positives here.

/**
 * LaTeX template for the DESIGN CV generator (`generate-design.mjs`).
 *
 * The layout is the "sidebar" direction the author picked from the three
 * prototypes (plan/cv-redesign/, 2026-08-26): a full-width header, then two
 * `paracol` columns that FLOW independently across pages — main column
 * (profile, experience, projects, education) at 64%, sidebar (skills with
 * level dots, languages, certificates, compact publications) at 36%. paracol
 * is what AltaCV 1.7.4 itself migrated to: unlike the old marginpar sidebar,
 * both columns break across pages, so there are no sync points and no
 * half-empty pages. Measured on real content: 3 pages at 94-97% fill against
 * the retired AltaCV layout's 6 pages at 52-79%.
 *
 * ── Page-break policy ─────────────────────────────────────────────────────
 * No `\needspace`, no `minipage` wrappers. Items are kept together SOFTLY:
 * a negative penalty before each item makes that the preferred break point,
 * and a raised `\interlinepenalty` inside discourages (not forbids) breaking
 * mid-item. An item only splits when it is taller than the space left, and
 * never right after its title (`\\*` / `\nobreak`).
 *
 * ── Fonts ─────────────────────────────────────────────────────────────────
 * Site typography: Space Grotesk (display, vendored TTF), IBM Plex Sans
 * (body) + IBM Plex Mono, both from TeX Live. Plex is loaded BY FILENAME:
 * the family-name lookup ("IBM Plex Sans SemiBold") silently fails and
 * typesets every bold run in nullfont — the text just disappears from the
 * PDF. Filename lookup goes through kpathsea and cannot miss.
 *
 * @module
 */

/**
 * Builds the full preamble, brand tokens and every macro of the layout.
 *
 * @param {object} opts - Preamble parameters.
 * @param {string} opts.babelLang - babel language name.
 * @param {string} opts.docLang - BCP-47 language tag for hyperref metadata.
 * @param {string} opts.pdfTitle - PDF title metadata.
 * @param {string} opts.pdfSubject - PDF subject metadata.
 * @param {string} opts.pdfKeywords - PDF keywords metadata.
 * @returns {string} The preamble LaTeX.
 */
export function designPreamble({
  babelLang,
  docLang,
  pdfTitle,
  pdfSubject,
  pdfKeywords,
}) {
  // es-noshorthands only exists for Spanish; babel errors on it under english.
  const babelOptions =
    babelLang === "spanish" ? "spanish,es-noshorthands" : babelLang;
  return String.raw`% =====================================================================
%  CV — José Manuel Requena Plens — Versión diseño (sidebar/paracol)
%  GENERADO automáticamente desde src/content/cv/{es,en}.yaml + papers.bib.
%  NO editar a mano: los cambios se sobrescriben. Editar el YAML + el generador
%  (scripts/cv/generate-design.mjs). Motor: LuaLaTeX + fontspec.
% =====================================================================
% NO \DocumentMetadata here, deliberately: tagging (tagpdf) does not support
% paracol — the column re-processing re-creates structure objects and the run
% dies with "\g__tag_struct_N_prop already defined" mid-document. The tagged,
% accessible documents are the ATS versions; this one keeps /Lang,
% pdfdisplaydoctitle and the visual design. Re-test when the LaTeX tagging
% project lists paracol as supported.
\documentclass[10pt,a4paper]{article}
\usepackage[a4paper,margin=1.2cm,top=1.1cm,bottom=1.1cm]{geometry}
\usepackage{fontspec}
% es-noshorthands (Spanish only): its shorthands make characters active that
% broke the contact row (Missing \endcsname at \ContactEntry's ~); nothing
% in generated, fully-escaped content needs them.
\usepackage[${babelOptions}]{babel}
\usepackage{xcolor}
\usepackage{enumitem}
\usepackage{fontawesome5}
\usepackage{graphicx}
\usepackage{pgffor}
\usepackage{paracol}
\usepackage{hyperref}
\raggedbottom
% Long bullet lines in the 64% column would otherwise overflow; the stretch
% absorbs every overfull box (at 1.5em one 9.7pt box survived in each locale
% - a hyphen-compound bullet; 3em clears it without visibly loose lines).
\emergencystretch=3em

% ---- Site light palette — KEEP-IN-SYNC: light-tokens (src/styles/tokens.css)
% The redesign's brand is AMBER (#F5A623 on dark); as text on a light page it
% is the darkened --color-primary #8F5300 (AA), with --accent-hi #C07A10 for
% decorative fills only. Page background is the site's warm --color-bg.
\definecolor{accent}{HTML}{8F5300}
\definecolor{accenthi}{HTML}{C07A10}
\definecolor{heading}{HTML}{1A1A18}
\definecolor{ink}{HTML}{46453F}
\definecolor{muted}{HTML}{666560}
\definecolor{border}{HTML}{DCDBD3}
\definecolor{pagebg}{HTML}{FAFAF7}
\pagecolor{pagebg}

% hypersetup AFTER the palette: under \DocumentMetadata (pdfmanagement),
% hyperref resolves urlcolor/linkcolor at \hypersetup time, not lazily —
% with the colors below undefined it aborts with "Unknown color 'accent'".
\hypersetup{
  hidelinks, colorlinks=true, urlcolor=accent, linkcolor=accent,
  pdfdisplaydoctitle=true,
  pdftitle={${pdfTitle}},
  pdfauthor={José Manuel Requena Plens},
  pdfsubject={${pdfSubject}},
  pdfkeywords={${pdfKeywords}},
  pdflang={${docLang}},
}

% ---- Site typography (see module docblock for why filenames) ----
\setmainfont{IBMPlexSans-Regular.otf}[
  BoldFont=IBMPlexSans-SemiBold.otf,
  ItalicFont=IBMPlexSans-Italic.otf,
  BoldItalicFont=IBMPlexSans-SemiBoldItalic.otf]
\newfontfamily\displayfont{SpaceGrotesk}[
  Path=../resources/fonts/, Extension=.ttf,
  UprightFont=*-Medium, BoldFont=*-Bold]
\newfontfamily\cvmono{IBMPlexMono-Regular.otf}[BoldFont=IBMPlexMono-SemiBold.otf]
\color{ink}
\pagestyle{empty}
\setlength{\parindent}{0pt}

% ---- columns ----
\columnratio{0.645}
\setlength{\columnsep}{18pt}

% ---- helpers ----
\newcommand{\SkillDots}[1]{{\scriptsize\foreach \i in {1,...,5}{\ifnum\i>#1{\textcolor{border}{\faCircle}}\else{\textcolor{accenthi}{\faCircle}}\fi\,}}}
\newcommand{\CVDot}{\,\textcolor{accent}{\textbullet}\,}
\newcommand{\SoftKeepStart}{\par\penalty-200\interlinepenalty=300\relax}
\newcommand{\SoftKeepEnd}{\par\interlinepenalty=0\relax}
\newcommand{\ContactEntry}[3]{%
  \mbox{{\color{accent}#1}~{\cvmono\footnotesize\ifx\relax#3\relax#2\else\href{#3}{#2}\fi}}\hspace{0.8em plus 0.6em}}

% ---- sections ----
\newcommand{\CVSection}[1]{%
  \par\penalty-400\vspace{8pt}%
  {\cvmono\scriptsize\color{muted}//\ }{\displayfont\bfseries\large\color{heading}\MakeUppercase{#1}}\\[-0.55em]
  {\color{accent}\rule{\linewidth}{1.2pt}}\par\nobreak\vspace{4pt}}
\newcommand{\SideSection}[1]{%
  \par\penalty-400\vspace{8pt}%
  {\displayfont\bfseries\color{heading}\MakeUppercase{#1}}\\[-0.6em]
  {\color{border}\rule{\linewidth}{0.9pt}}\par\nobreak\vspace{3pt}}

% ---- experience ----
\newcommand{\CVEventStart}[5]{%
  \SoftKeepStart\vspace{4pt}%
  {\displayfont\bfseries\color{heading}#1}\hfill{\cvmono\footnotesize\color{muted}#3}\\*
  {\small\color{accent}#2}{\small\color{muted}\ifx\relax#5\relax\else\ \textperiodcentered\ #5\fi\ifx\relax#4\relax\else\ \textperiodcentered\ #4\fi}\par\nobreak}
\newcommand{\CVEventSummary}[1]{{\nobreak\small\color{muted}\itshape #1\par}}
\newcommand{\CVBulletsBegin}{\nobreak\begin{itemize}[leftmargin=1.05em,itemsep=1pt,topsep=2pt,parsep=0pt,label=\textcolor{accent}{\small\textbullet}]}
\newcommand{\CVBullet}[1]{\item #1}
\newcommand{\CVBulletsEnd}{\end{itemize}}
\newcommand{\CVEventEnd}{\SoftKeepEnd\vspace{2pt}}

% ---- projects (metrics line from live GitHub stats, like the ATS CVs) ----
\newcommand{\CVProject}[4]{%
  \SoftKeepStart\vspace{3pt}%
  {\displayfont\bfseries\color{heading}#1}\hfill{\cvmono\footnotesize\color{muted}#2}\par\nobreak
  \ifx\relax#3\relax\else{\footnotesize\color{muted}#3\par\nobreak}\fi
  {\small #4\par}\SoftKeepEnd\vspace{2pt}}

% ---- education ----
\newcommand{\CVEdu}[4]{%
  \SoftKeepStart\vspace{2pt}{\bfseries #1}\hfill{\cvmono\footnotesize\color{muted}#3}\\*
  {\small\color{muted}#2\ifx\relax#4\relax\else\ \textperiodcentered\ #4\fi}\par\SoftKeepEnd}

% ---- sidebar: skills / languages / certificates / publications ----
\newcommand{\CVSkillGroupStart}[1]{\SoftKeepStart\vspace{3pt}{\bfseries\small #1}\par\nobreak\vspace{1pt}\footnotesize}
\newcommand{\CVSkillI}[2]{\mbox{#1}\hfill\SkillDots{#2}\\*[0.5pt]}
\newcommand{\CVSkillGroupEnd}{\par\SoftKeepEnd\normalsize\vspace{1pt}}
\newcommand{\CVLang}[2]{{\bfseries #1}\hfill{\footnotesize\color{muted}#2}\\*[0.5pt]}
\newcommand{\CVCertGroupStart}[1]{\SoftKeepStart\vspace{2pt}{\bfseries\small #1}\par\nobreak\footnotesize\color{muted}\raggedright}
\newcommand{\CVCertI}[3]{{\color{ink}#1} \mbox{(#2, #3)}\\*[0.5pt]}
\newcommand{\CVCertGroupEnd}{\par\SoftKeepEnd\normalsize\color{ink}}
\newcommand{\CVPubGroupStart}[1]{\SoftKeepStart\vspace{2pt}{\bfseries\small #1}\par\nobreak\footnotesize\raggedright}
\newcommand{\CVPubI}[3]{{\color{ink}#1}\ {\color{muted}\textperiodcentered\ \textit{#2}, #3}\par\vspace{1.5pt}}
\newcommand{\CVPubGroupEnd}{\par\SoftKeepEnd\normalsize\vspace{1pt}}
`;
}

/**
 * Builds the full-width header: name, headline, tagline, contact row, photo.
 *
 * @param {object} opts - Header parts, already LaTeX-escaped.
 * @param {string} opts.name - Candidate name.
 * @param {string} opts.headline - Job headline.
 * @param {string} opts.tagline - Target-roles tagline.
 * @param {string} opts.contact - `\ContactEntry` calls.
 * @param {string} opts.photoAlt - Alt text for the photo (tagged PDF).
 * @returns {string} The header LaTeX.
 */
export function designHeader({ name, headline, tagline, contact, photoAlt }) {
  return String.raw`\begin{document}
\begin{minipage}{\dimexpr\linewidth-2.9cm}
  {\displayfont\bfseries\fontsize{22pt}{24pt}\selectfont\color{heading}${name}\par}\vspace{2pt}
  {\displayfont\large\color{accent}${headline}\ \ {\cvmono\footnotesize\color{muted}${tagline}}\par}\vspace{4pt}
  ${contact}
\end{minipage}\hfill
\begin{minipage}{2.5cm}\includegraphics[alt={${photoAlt}},width=2.4cm]{../resources/foto.jpeg}\end{minipage}
\par\vspace{2pt}{\color{border}\rule{\linewidth}{0.9pt}}\par\vspace{2pt}
`;
}
