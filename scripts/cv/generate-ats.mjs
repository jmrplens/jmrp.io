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
 * ── The phone number lives in `.env`, not in the YAML ─────────────────────
 * A phone number is the one contact field an ATS ranks on that its owner does
 * not want crawled: `public/pdf/` is served by nginx and linked from the site,
 * so anything compiled into it is public. `src/content/cv/{es,en}.yaml` feeds
 * the website too, so it cannot hold the number either.
 *
 * Instead `CV_PHONE` in `.env` (git-ignored) drives a SECOND, private set of
 * PDFs written to `cv_private/` — same filenames, whole directory ignored —
 * that is what gets uploaded to a job portal by hand. The public set is
 * byte-for-byte what it was before and never carries the number. Both come
 * from one build, so they cannot drift apart.
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

// `.env` is not loaded for us: this runs as a plain Node process from
// compile_cv.sh, not through Astro's env plugin. `loadEnvFile` never overwrites
// an already-set variable, so the precedence is shell > .env — exporting
// CV_PHONE= (empty) is how a checkout opts out of the private build.
try {
  process.loadEnvFile(path.join(REPO_ROOT, ".env"));
} catch {
  // No .env (CI, a fresh clone): the private set simply is not built.
}

/** The phone number for the private build, or undefined when not configured. */
const CV_PHONE = process.env.CV_PHONE?.trim() || undefined;

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
    cvLabel: "CV",
    cvFullLabel: "CV completo",
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
    profileTitle: "Summary",
    publicationsTitle: "Publications & conferences",
    cvLabel: "CV",
    cvFullLabel: "Full CV",
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

/**
 * The visible text for one contact link.
 *
 * The ORCID is a bare `0000-0003-1250-6212` in the YAML, and on the web that is
 * fine: it sits behind an ORCID icon with its own `ariaLabel`. Stripped of that
 * context in a PDF's contact row it is sixteen digits and three hyphens, and a
 * resume parser reads it as a PHONE NUMBER — measured: `phoneNumbers` came back
 * as `["0000-0003-1250-6212"]`. Prefixing the scheme name costs five characters
 * and tells the parser what it is looking at. The YAML label is left alone so
 * the CV page keeps rendering exactly what it renders today.
 *
 * @param {{kind?: string, label: string}} link - One entry of `basics.links`.
 * @returns {string} The text to typeset.
 */
export function labelForContact(link) {
  return link.kind === "orcid" ? `ORCID ${link.label}` : link.label;
}

/** Star-count wording per locale, singular and plural. */
const STAR_WORD = {
  en: ["star", "stars"],
  es: ["estrella", "estrellas"],
};

/**
 * Formats a single project metric, spelling out the star glyph.
 *
 * `formatStats` emits "27★" and the website renders that as-is, which is right
 * for a web page. In a PDF it is not: the glyph used to go through `\faStar`,
 * whose ToUnicode maps to the literal string "STAR", so extractors read a junk
 * token glued onto the count ("30STAR • 50 releases"). Spelling it out here
 * keeps the change on the LaTeX side and leaves the CV page untouched.
 *
 * @param {string} metric - One metric string, e.g. `27★` or `35 releases`.
 * @param {string} locale - `es` or `en`.
 * @returns {string} LaTeX for that metric.
 */
function fmtMetric(metric, locale) {
  const idx = metric.indexOf("★");
  if (idx === -1) return escapeLatex(metric);
  const count = metric.slice(0, idx).trim();
  const [one, many] = STAR_WORD[locale] ?? STAR_WORD.en;
  return `${escapeLatex(count)} ${count === "1" ? one : many}`;
}

/** Renders a projects section body. */
function renderProjects(items, profile, statsBySlug, locale) {
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
        .map((m) => fmtMetric(m, locale))
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

/** Reads a custom BibTeX field for an entry id (handles `{...}` and `"..."`). */
function bibField(bibText, id, field) {
  const reEntry = new RegExp(String.raw`@\w+\s*\{\s*${id}\s*,`, "i");
  const mEntry = reEntry.exec(bibText);
  if (!mEntry) return null;
  const start = mEntry.index;
  const next = bibText.indexOf("\n@", start);
  const body = bibText.slice(start, next === -1 ? undefined : next);
  const re = new RegExp(String.raw`${field}\s*=\s*[{"]([^}"]*)[}"]`, "i");
  const m = re.exec(body);
  return m ? m[1].trim() : null;
}

/** Formats a CSL author list in order, bolding the CV owner (no truncation). */
function formatAuthors(authors) {
  if (!authors || authors.length === 0) return "";
  return authors
    .map((a) => {
      const name = [a.given, a.family].filter(Boolean).join(" ");
      return /requena/i.test(a.family ?? "")
        ? String.raw`\textbf{${escapeLatex(name)}}`
        : escapeLatex(name);
    })
    .join(", ");
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
    // Strip any trailing period from BibTeX values so we don't double it up
    // when we append our own sentence period (e.g. "Voice Coil." -> "Voice Coil").
    const stripDot = (s) => {
      let v = s.trimEnd();
      while (v.endsWith(".")) v = v.slice(0, -1).trimEnd();
      return v;
    };
    const venue = stripDot(item["container-title"] ?? item.publisher ?? "");
    const title = stripDot(item.title ?? "");
    const pdf = bibField(bibText, item.id, "pdf");
    const titleTex = pdf
      ? markdownToLatex(`[${title}](${pdf})`)
      : escapeLatex(title);
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
  await Promise.all(
    (projects?.items ?? []).map(async (p) => {
      const slug = githubSlug(p.links);
      if (!slug) return;
      try {
        statsBySlug.set(slug, formatStats(await fetchRepoStats(slug), locale));
      } catch (error) {
        console.warn(`[cv] GitHub stats failed for ${slug}: ${error.message}`);
        statsBySlug.set(slug, []);
      }
    }),
  );
  return statsBySlug;
}

/**
 * Builds the full LaTeX document for a (locale, profile).
 *
 * @param {string} locale - `es` or `en`.
 * @param {string} profile - `normal` or `extended`.
 * @param {{phone?: string}} [options] - `phone` adds a tel: contact item; it
 *   is only ever passed for the private build (see the module docblock).
 * @returns {Promise<string>} The LaTeX source.
 */
export async function buildDocument(locale, profile, options = {}) {
  const meta = META[locale];
  const yamlPath = path.join(REPO_ROOT, `src/content/cv/${locale}.yaml`);
  const { basics, sections } = yaml.load(fs.readFileSync(yamlPath, "utf8"));
  const statsBySlug = await fetchProjectStats(sections, locale);

  let doc = documentPreamble({
    babelLang: meta.babelLang,
    docLang: meta.docLang,
    pdfTitle: `${basics.name} — ${
      profile === "extended" ? meta.cvFullLabel : meta.cvLabel
    } (${basics.headline})`,
    pdfSubject: meta.pdfSubject,
    pdfKeywords: meta.pdfKeywords,
  });

  const contactParts = [
    { text: basics.location },
    ...(basics.email
      ? [{ text: basics.email, url: `mailto:${basics.email}` }]
      : []),
    // Immediately after the email, which is where every resume parser expects
    // it and where it is least likely to be swallowed by the surrounding
    // profile links.
    ...(options.phone
      ? [
          {
            text: options.phone,
            url: `tel:${options.phone.replaceAll(/[^+\d]/gu, "")}`,
          },
        ]
      : []),
    ...basics.links.map((l) => ({
      text: labelForContact(l),
      url: l.url,
    })),
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
        doc += renderProjects(section.items, profile, statsBySlug, locale);
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

/**
 * Writes every (locale, profile) source into one directory.
 *
 * @param {string} outDir - Absolute destination directory.
 * @param {{phone?: string}} options - Passed through to `buildDocument`.
 */
async function writeSet(outDir, options) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const [key, filename] of Object.entries(OUTPUT_NAMES)) {
    const [locale, profile] = key.split(":", 2);
    const outPath = path.join(outDir, filename);
    fs.writeFileSync(
      outPath,
      await buildDocument(locale, profile, options),
      "utf8",
    );
    console.log(`✓ ${path.relative(REPO_ROOT, outPath)}`);
  }
}

async function main() {
  const [argLocale, argProfile] = process.argv.slice(2);

  if (argLocale && argProfile) {
    process.stdout.write(await buildDocument(argLocale, argProfile));
    return;
  }

  await writeSet(path.join(REPO_ROOT, "cv_latex", "generated"), {});

  if (CV_PHONE) {
    // compile_cv.sh symlinks cv_private/resources -> cv_latex/resources, so the
    // private sources reach the fonts by the same `../resources/fonts/` string
    // as the public ones. Giving them a deeper path instead does not work:
    // luaotfload silently fails to load a Path containing `../..` or an
    // absolute directory, embeds no Inter at all, and LuaTeX dies at PDF
    // finalisation with `cannot find file ''`.
    await writeSet(path.join(REPO_ROOT, "cv_private", "tex"), {
      phone: CV_PHONE,
    });
  }
}

// Run only when invoked as a CLI, not when imported: generate-design.mjs
// imports labelForContact from here, and an unguarded top-level main() made
// that import silently regenerate all four ATS sources as a side effect.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
