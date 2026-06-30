// This module emits LaTeX, where `{...}` braces are pervasive and not template
// interpolations; the lint rule below produces only false positives here.
/* eslint-disable unicorn/no-incorrect-template-string-interpolation */
/**
 * ATS CV generator.
 *
 * Reads the single source of truth (`src/content/cv/{es,en}.yaml`) and emits the
 * ATS LaTeX (`cv_latex/generated/CV_..._{SPA,ENG}_ATS{,_EXT}.tex`) for two
 * profiles:
 *   - `normal`   — concise (recruiter/portal-friendly), pruned via the YAML
 *                  `ats` hints.
 *   - `extended` — exhaustive: every job, all skills, all certificates, full
 *                  education, plus a complete Publications section from
 *                  `papers.bib`.
 *
 * Usage:
 *   node scripts/cv/generate-ats.mjs            # generate all 4 files
 *   node scripts/cv/generate-ats.mjs es normal  # one (locale, profile) to stdout
 *
 * @module
 */

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  documentEnd,
  documentPreamble,
  headerBlock,
  sectionTitle,
} from "./ats-template.mjs";
import { fetchRepoStats, formatStats, githubSlug } from "./github-stats.mjs";
import { escapeLatex, markdownToLatex } from "./inline-markdown.mjs";

const nodeRequire = createRequire(import.meta.url);
const Cite = nodeRequire("citation-js");
const yaml = nodeRequire("js-yaml");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

/** Per-locale ATS-only labels/metadata not present in the YAML. */
const META = {
  es: {
    babelLang: "spanish",
    docLang: "es-ES",
    pdfSubject: "Curriculum Vitae",
    pdfKeywords:
      "firmware, embedded, C, STM32, ESP32, FreeRTOS, Go, Python, QA, CI/CD, SonarQube, Modbus, RTOS, software, DevSecOps",
    profileTitle: "Perfil",
    publicationsTitle: "Publicaciones y congresos",
    pubGroupLabels: {
      journal: "Revista",
      conference: "Congresos",
      thesis: "Tesis y proyectos",
    },
  },
  en: {
    babelLang: "english",
    docLang: "en-US",
    pdfSubject: "Curriculum Vitae",
    pdfKeywords:
      "firmware, embedded, C, STM32, ESP32, FreeRTOS, Go, Python, QA, CI/CD, SonarQube, Modbus, RTOS, software, DevSecOps",
    profileTitle: "Profile",
    publicationsTitle: "Publications & conferences",
    pubGroupLabels: {
      journal: "Journal",
      conference: "Conferences",
      thesis: "Theses & projects",
    },
  },
};

/** Builds an inline-markdown label for an organisation entity. */
function orgMarkdown(o) {
  if (o.short) {
    return o.url
      ? `${o.name} ([${o.short}](${o.url}))`
      : `${o.name} (${o.short})`;
  }
  return o.url ? `[${o.name}](${o.url})` : o.name;
}

/** Builds the LaTeX org line: orgs joined by ·, then — department. */
function orgLineLatex(item) {
  const orgs = (item.org ?? []).map(orgMarkdown).join(" · ");
  const full = item.department
    ? `${orgs} — ${orgMarkdown(item.department)}`
    : orgs;
  return markdownToLatex(full);
}

/** Renders an `itemize` from an array of inline-markdown bullet strings. */
function renderItemize(items) {
  if (!items || items.length === 0) return "";
  const bullets = items.map((it) => String.raw`  \item ${markdownToLatex(it)}`);
  return `\\begin{itemize}\n${bullets.join("\n")}\n\\end{itemize}\n`;
}

/** Renders the `\cventry` head for a chronological entry. */
function entryHead(title, item, profile) {
  const period = markdownToLatex(
    item.period == null ? "" : String(item.period),
  );
  const org =
    profile === "normal" && item.ats?.org
      ? escapeLatex(item.ats.org)
      : orgLineLatex(item);
  // Extended folds location into the org line so long lists wrap cleanly.
  const arg2 =
    profile === "extended" && item.location
      ? `${org} · ${escapeLatex(item.location)}`
      : org;
  const arg3 = profile === "extended" ? "" : escapeLatex(item.location ?? "");
  return `\\cventry{${markdownToLatex(title)}}{${arg2}}{${arg3}}{${period}}\n`;
}

/** Renders a single experience entry. */
function renderExperience(item, profile) {
  let out = entryHead(item.role, item, profile);
  if (profile === "extended") {
    if (item.summary) out += `${markdownToLatex(item.summary)}\n`;
    for (const note of item.notes ?? [])
      out += `${markdownToLatex(note)}\\par\n`;
    out += renderItemize(item.bullets);
  } else {
    out += renderItemize(item.ats?.bullets ?? item.bullets);
  }
  out += "\\vspace{2pt}\n";
  return out;
}

/** Renders a single education entry. */
function renderEducation(item, profile) {
  let out = entryHead(item.degree, item, profile);
  if (profile === "extended") {
    if (item.summary) out += `${markdownToLatex(item.summary)}\n`;
    for (const note of item.notes ?? [])
      out += `${markdownToLatex(note)}\\par\n`;
    out += renderItemize(item.bullets);
    if (item.documents?.length) {
      const links = item.documents
        .map((d) => markdownToLatex(`[${d.label}](${d.url})`))
        .join(String.raw` \divider `);
      out += `{\\footnotesize ${links}}\\par\n`;
    }
  } else {
    const summary = item.ats?.summary ?? item.summary;
    if (summary)
      out += `{\\color{muted}\\small ${markdownToLatex(summary)}}\\par\n`;
  }
  out += "\\vspace{2pt}\n";
  return out;
}

/** Renders a skills section body. */
function renderSkills(groups, profile) {
  return groups
    .map((group) => {
      const items = group.items
        .map((it) =>
          profile === "extended" && it.note
            ? `${escapeLatex(it.name)} ${escapeLatex(it.note)}`
            : escapeLatex(it.name),
        )
        .join(", ");
      return String.raw`\cvskill{${escapeLatex(group.category)}}{${items}}`;
    })
    .join("\n");
}

/** Formats a single project metric, converting the star glyph to `\faStar`. */
function fmtMetric(metric) {
  const idx = metric.indexOf("★");
  if (idx !== -1)
    return String.raw`${escapeLatex(metric.slice(0, idx).trim())}\,\faStar`;
  return escapeLatex(metric);
}

/** Renders a projects section body. */
function renderProjects(items, profile, statsBySlug) {
  return items
    .filter((p) => !(profile === "normal" && p.ats?.normal === false))
    .map((p) => {
      const firstLink = p.links?.[0];
      const name = firstLink
        ? markdownToLatex(`[${p.name}](${firstLink.url})`)
        : escapeLatex(p.name);
      const slug = githubSlug(p.links);
      const auto = (slug && statsBySlug.get(slug)) || [];
      const metrics = [...auto, ...(p.metrics ?? [])]
        .map(fmtMetric)
        .join(String.raw` \divider `);
      let out = `\\cvproject{${name}}{${escapeLatex(p.tech ?? "")}}{${metrics}}\n`;
      if (p.description) {
        out += `${markdownToLatex(p.description)}\\par\\vspace{4pt}\n`;
      }
      return out;
    })
    .join("\n");
}

/** Renders a certificates section body (grouped, extended only). */
function renderCertificates(groups) {
  return groups
    .map((group) => {
      const items = group.items
        .map((c) => {
          const name = c.url
            ? markdownToLatex(`[${c.name}](${c.url})`)
            : escapeLatex(c.name);
          const meta = [c.school, c.hours]
            .filter(Boolean)
            .map((v) => escapeLatex(v))
            .join(", ");
          return meta ? `${name} (${meta})` : name;
        })
        .join(String.raw` \divider `);
      return `\\cvsubhead{${escapeLatex(group.category)}}\n${items}\\par\\vspace{4pt}`;
    })
    .join("\n");
}

/** Reads a custom BibTeX field for an entry id via a linear scan. */
function bibField(bibText, id, field) {
  const start = bibText.indexOf(`{${id},`);
  if (start === -1) return null;
  const next = bibText.indexOf("\n@", start);
  const body = bibText.slice(start, next === -1 ? undefined : next);
  const re = new RegExp(String.raw`${field}\s*=\s*\{([^}]*)\}`, "i");
  const m = re.exec(body);
  return m ? m[1].trim() : null;
}

/** Formats a CSL author list, bolding the CV owner and truncating long lists. */
function formatAuthors(authors) {
  if (!authors || authors.length === 0) return "";
  const fmt = (a) => {
    const name = [a.given, a.family].filter(Boolean).join(" ");
    return /requena/i.test(a.family ?? "")
      ? String.raw`\textbf{${escapeLatex(name)}}`
      : escapeLatex(name);
  };
  if (authors.length <= 8) return authors.map(fmt).join(", ");
  const head = authors.slice(0, 7).map(fmt);
  const meIdx = authors.findIndex((a) => /requena/i.test(a.family ?? ""));
  if (meIdx >= 7) head.push(fmt(authors[meIdx]));
  return `${head.join(", ")}, et al.`;
}

/** Renders the full Publications section from papers.bib (extended only). */
function renderPublications(meta) {
  const bibPath = path.join(
    REPO_ROOT,
    "src/content/publications_data/papers.bib",
  );
  const bibText = fs.readFileSync(bibPath, "utf8");
  const data = new Cite(bibText).data.filter((item) => {
    const show = bibField(bibText, item.id, "bibtex_show");
    return !show || show.toLowerCase() === "true";
  });
  data.sort(
    (a, b) =>
      (b.issued?.["date-parts"]?.[0]?.[0] ?? 0) -
      (a.issued?.["date-parts"]?.[0]?.[0] ?? 0),
  );

  const buckets = { journal: [], conference: [], thesis: [] };
  for (const item of data) {
    if (item.type === "article-journal") buckets.journal.push(item);
    else if (item.type === "thesis" || item.type === "report")
      buckets.thesis.push(item);
    else buckets.conference.push(item);
  }

  const renderItem = (item) => {
    const year = item.issued?.["date-parts"]?.[0]?.[0] ?? "";
    const venue = item["container-title"] ?? item.publisher ?? "";
    const pdf = bibField(bibText, item.id, "pdf");
    const titleTex = pdf
      ? markdownToLatex(`[${item.title ?? ""}](${pdf})`)
      : escapeLatex(item.title ?? "");
    const yearTex = year ? ` (${year}).` : "";
    const venueTex = venue ? String.raw` \textit{${escapeLatex(venue)}}.` : "";
    return String.raw`  \item ${formatAuthors(item.author)}${yearTex} ${titleTex}.${venueTex}`;
  };

  const sections = [
    { label: meta.pubGroupLabels.journal, items: buckets.journal },
    { label: meta.pubGroupLabels.conference, items: buckets.conference },
    { label: meta.pubGroupLabels.thesis, items: buckets.thesis },
  ].filter((g) => g.items.length > 0);

  let out = sectionTitle(meta.publicationsTitle);
  for (const group of sections) {
    out += `\\cvsubhead{${escapeLatex(group.label)}}\n`;
    out += `\\begin{itemize}\n${group.items.map(renderItem).join("\n")}\n\\end{itemize}\n`;
  }
  return out;
}

/** Pre-fetches GitHub stats for every project (slug → localized metric badges). */
async function fetchProjectStats(sections, locale) {
  const statsBySlug = new Map();
  const projects = sections.find((s) => s.kind === "projects");
  for (const p of projects?.items ?? []) {
    const slug = githubSlug(p.links);
    if (!slug || statsBySlug.has(slug)) continue;
    try {
      statsBySlug.set(slug, formatStats(await fetchRepoStats(slug), locale));
    } catch (error) {
      console.warn(`[cv] GitHub stats failed for ${slug}: ${error.message}`);
      statsBySlug.set(slug, []);
    }
  }
  return statsBySlug;
}

/** Builds the full LaTeX document for a (locale, profile). */
export async function buildDocument(locale, profile) {
  const meta = META[locale];
  const yamlPath = path.join(REPO_ROOT, `src/content/cv/${locale}.yaml`);
  const { basics, sections } = yaml.load(fs.readFileSync(yamlPath, "utf8"));
  const statsBySlug = await fetchProjectStats(sections, locale);

  let doc = documentPreamble({
    babelLang: meta.babelLang,
    docLang: meta.docLang,
    pdfTitle: `${basics.name} — CV (${basics.headline})`,
    pdfSubject: meta.pdfSubject,
    pdfKeywords: meta.pdfKeywords,
  });

  const contactParts = [
    { text: basics.location },
    ...(basics.email
      ? [{ text: basics.email, url: `mailto:${basics.email}` }]
      : []),
    ...basics.links.map((l) => ({ text: l.label, url: l.url })),
  ];
  doc += headerBlock({
    name: basics.name,
    headline: basics.headline,
    contactParts,
    availability: basics.availability,
  });

  doc += sectionTitle(meta.profileTitle);
  doc += `${markdownToLatex(basics.profile)}\n`;

  for (const section of sections) {
    if (profile === "normal" && section.ats?.normal === false) continue;
    doc += sectionTitle(section.title);
    switch (section.kind) {
      case "experience": {
        const items = section.items.filter(
          (it) => !(profile === "normal" && it.ats?.normal === false),
        );
        doc += items.map((it) => renderExperience(it, profile)).join("");
        break;
      }
      case "education": {
        const items = section.items.filter(
          (it) => !(profile === "normal" && it.ats?.normal === false),
        );
        doc += items.map((it) => renderEducation(it, profile)).join("");
        break;
      }
      case "skills": {
        doc += renderSkills(section.groups, profile) + "\n";
        break;
      }
      case "projects": {
        doc += renderProjects(section.items, profile, statsBySlug);
        break;
      }
      case "certificates": {
        doc += renderCertificates(section.groups);
        break;
      }
    }
  }

  if (profile === "extended") doc += renderPublications(meta);

  doc += documentEnd();
  return doc;
}

/** Output filenames keyed by `${locale}:${profile}`. */
const OUTPUT_NAMES = {
  "es:normal": "CV_RequenaPlensJoseManuel_SPA_ATS.tex",
  "es:extended": "CV_RequenaPlensJoseManuel_SPA_ATS_EXT.tex",
  "en:normal": "CV_RequenaPlensJoseManuel_ENG_ATS.tex",
  "en:extended": "CV_RequenaPlensJoseManuel_ENG_ATS_EXT.tex",
};

async function main() {
  const [argLocale, argProfile] = process.argv.slice(2);

  if (argLocale && argProfile) {
    process.stdout.write(await buildDocument(argLocale, argProfile));
    return;
  }

  const outDir = path.join(REPO_ROOT, "cv_latex", "generated");
  fs.mkdirSync(outDir, { recursive: true });
  for (const [key, filename] of Object.entries(OUTPUT_NAMES)) {
    const [locale, profile] = key.split(":");
    const outPath = path.join(outDir, filename);
    fs.writeFileSync(outPath, await buildDocument(locale, profile), "utf8");
    console.log(`✓ ${path.relative(REPO_ROOT, outPath)}`);
  }
}

// eslint-disable-next-line unicorn/no-top-level-side-effects -- CLI entry point
await main();
