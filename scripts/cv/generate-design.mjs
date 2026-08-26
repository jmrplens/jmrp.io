// This module emits LaTeX, where `{...}` braces are pervasive and not template
// interpolations; the lint rule below produces only false positives here.

/**
 * DESIGN CV generator — the sidebar layout, fed from the same single source
 * of truth as the ATS CVs.
 *
 * Reads `src/content/cv/{es,en}.yaml` plus `papers.bib` and emits
 * `cv_latex/generated/CV_RequenaPlensJoseManuel_{ENG,SPA}.tex`. This replaced
 * the two hand-authored AltaCV documents in 2026-08: they had drifted from the
 * YAML (one job missing, stale figures, no project stats) because every change
 * had to be made three times. Now web, ATS PDFs and design PDFs all render the
 * same YAML.
 *
 * Layout and rationale live in `design-template.mjs`; the direction (sidebar,
 * compact publications in it, photo kept) was picked by the author from three
 * measured prototypes — see plan/cv-redesign/PLAN.md.
 *
 * The phone number works exactly like in `generate-ats.mjs`: `CV_PHONE` in
 * `.env` drives a second private set under `cv_private/tex/`, and the public
 * set never carries it.
 *
 * Usage:
 *   node scripts/cv/generate-design.mjs        # all files (both sets)
 *   node scripts/cv/generate-design.mjs es     # one locale to stdout
 *
 * @module
 */

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { designHeader, designPreamble } from "./design-template.mjs";
import { labelForContact } from "./generate-ats.mjs";
import { fetchRepoStats, formatStats, githubSlug } from "./github-stats.mjs";
import { escapeLatex, markdownToLatex } from "./inline-markdown.mjs";

const nodeRequire = createRequire(import.meta.url);
const Cite = nodeRequire("citation-js");
const yaml = nodeRequire("js-yaml");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

// Same env contract as generate-ats.mjs (which already loaded .env for this
// process if we are invoked after it; loading twice is harmless because
// loadEnvFile never overwrites existing variables).
try {
  process.loadEnvFile(path.join(REPO_ROOT, ".env"));
} catch {
  // No .env (CI, fresh clone): the private set simply is not built.
}

/** The phone number for the private build, or undefined when not configured. */
const CV_PHONE = process.env.CV_PHONE?.trim() || undefined;

/** Per-locale labels not present in the YAML. */
const META = {
  es: {
    babelLang: "spanish",
    docLang: "es-ES",
    pdfSubject: "Curriculum Vitae",
    pdfKeywords:
      "firmware, embedded, C, STM32, ESP32, FreeRTOS, Go, Python, QA, CI/CD, SonarQube, Modbus, RTOS, software, DevSecOps",
    publicationsTitle: "Publicaciones",
    languagesTitle: "Idiomas",
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
    publicationsTitle: "Publications",
    languagesTitle: "Languages",
    pubGroupLabels: {
      journal: "Journal articles",
      conference: "Conference papers",
      thesis: "Theses",
    },
  },
};

/** Contact icons per `basics.links[].kind`. */
const CONTACT_ICONS = {
  website: String.raw`\faGlobe`,
  github: String.raw`\faGithub`,
  linkedin: String.raw`\faLinkedin`,
  scholar: String.raw`\faGraduationCap`,
  orcid: String.raw`\faOrcid`,
};

/** Wraps text in an `\href` when a URL is present, site-relative URLs included. */
function href(url, text) {
  if (!url) return text;
  const abs = url.startsWith("/") ? `https://jmrp.io${url}` : url;
  return String.raw`\href{${abs}}{${text}}`;
}

/** Renders an org (string or list of {name, url}) as linked names. */
function orgTex(org) {
  if (!Array.isArray(org)) return escapeLatex(org ?? "");
  return org.map((o) => href(o.url, escapeLatex(o.name))).join(" + ");
}

/** Finds a raw BibTeX field citation-js does not surface (e.g. `pdf`). */
function bibField(bibText, id, field) {
  const m = new RegExp(
    String.raw`@\w+\{${id},[^@]*?\b${field}\s*=\s*\{([^}]*)\}`,
    "u",
  ).exec(bibText);
  return m?.[1];
}

/** Renders the experience section body. */
function renderExperience(section) {
  const out = [String.raw`\CVSection{${escapeLatex(section.title)}}`];
  for (const it of section.items) {
    const dept = it.department
      ? href(it.department.url, escapeLatex(it.department.name))
      : "";
    out.push(
      String.raw`\CVEventStart{${escapeLatex(it.role)}}{${orgTex(it.org)}}{${escapeLatex(it.period)}}{${escapeLatex(it.location ?? "")}}{${dept}}`,
    );
    if (it.summary)
      out.push(String.raw`\CVEventSummary{${markdownToLatex(it.summary)}}`);
    if (it.bullets?.length) {
      out.push(
        String.raw`\CVBulletsBegin`,
        ...it.bullets.map(
          (b) => String.raw`  \CVBullet{${markdownToLatex(b)}}`,
        ),
        String.raw`\CVBulletsEnd`,
      );
    }
    out.push(String.raw`\CVEventEnd`);
  }
  return out.join("\n");
}

/** Renders the projects section body, with the live GitHub metric badges. */
function renderProjects(section, statsBySlug) {
  const out = [String.raw`\CVSection{${escapeLatex(section.title)}}`];
  for (const p of section.items) {
    const slug = githubSlug(p.links);
    const metrics = [
      ...((slug && statsBySlug.get(slug)) || []),
      ...(p.metrics ?? []),
    ]
      // formatStats emits the count as "27★". escapeLatex has no mapping for
      // the star and it came out as a stray omega; the design CV is not bound
      // by ATS extraction, so here it can be the real icon.
      .map((m) =>
        m.includes("★")
          ? String.raw`${escapeLatex(m.replace("★", "").trim())}\,{\color{accenthi}\scriptsize\faStar}`
          : escapeLatex(m),
      )
      .join(String.raw` \CVDot{} `);
    out.push(
      String.raw`\CVProject{${href(p.links?.[0]?.url, escapeLatex(p.name))}}{${escapeLatex(p.tech ?? "")}}{${metrics}}{${markdownToLatex(p.description ?? "")}}`,
    );
  }
  return out.join("\n");
}

/** Renders the education section body. */
function renderEducation(section) {
  const out = [String.raw`\CVSection{${escapeLatex(section.title)}}`];
  for (const e of section.items) {
    out.push(
      String.raw`\CVEdu{${escapeLatex(e.degree)}}{${orgTex(e.org)}}{${escapeLatex(e.period ?? "")}}{${escapeLatex(e.location ?? "")}}`,
    );
  }
  return out.join("\n");
}

/** Renders the sidebar skills (name + level dots, one per line). */
function renderSkills(section) {
  const out = [String.raw`\CVSection{${escapeLatex(section.title)}}`];
  for (const g of section.groups) {
    out.push(
      String.raw`\CVSkillGroupStart{${escapeLatex(g.category)}}`,
      ...g.items.map(
        (s) => String.raw`  \CVSkillI{${escapeLatex(s.name)}}{${s.level ?? 3}}`,
      ),
      String.raw`\CVSkillGroupEnd`,
    );
  }
  return out.join("\n");
}

/** Renders the sidebar certificates (compact stacked entries). */
function renderCertificates(section) {
  const out = [String.raw`\CVSection{${escapeLatex(section.title)}}`];
  for (const g of section.groups) {
    out.push(
      String.raw`\CVCertGroupStart{${escapeLatex(g.category)}}`,
      ...g.items.map(
        (c) =>
          String.raw`  \CVCertI{${href(c.url, escapeLatex(c.name))}}{${escapeLatex(c.school)}}{${escapeLatex((c.hours ?? "").replace(" Hours", " h").replace(" Horas", " h"))}}`,
      ),
      String.raw`\CVCertGroupEnd`,
    );
  }
  return out.join("\n");
}

/** Renders the sidebar publications, compact, straight from papers.bib. */
function renderPublications(meta) {
  const bibText = fs.readFileSync(
    path.join(REPO_ROOT, "src/content/publications_data/papers.bib"),
    "utf8",
  );
  const items = new Cite(bibText).data.filter((item) => {
    const show = bibField(bibText, item.id, "bibtex_show");
    return !show || show.toLowerCase() === "true";
  });
  items.sort(
    (a, b) =>
      (b.issued?.["date-parts"]?.[0]?.[0] ?? 0) -
      (a.issued?.["date-parts"]?.[0]?.[0] ?? 0),
  );
  const buckets = { journal: [], conference: [], thesis: [] };
  for (const it of items) {
    if (it.type === "article-journal") buckets.journal.push(it);
    else if (it.type === "thesis" || it.type === "report")
      buckets.thesis.push(it);
    else buckets.conference.push(it);
  }
  const out = [String.raw`\CVSection{${escapeLatex(meta.publicationsTitle)}}`];
  for (const [key, list] of Object.entries(buckets)) {
    if (list.length === 0) continue;
    out.push(
      String.raw`\CVPubGroupStart{${escapeLatex(meta.pubGroupLabels[key])}}`,
    );
    for (const it of list) {
      const year = it.issued?.["date-parts"]?.[0]?.[0] ?? "";
      const title = escapeLatex((it.title ?? "").replace(/\.$/u, ""));
      const venue = escapeLatex(
        (it["container-title"] ?? it.publisher ?? "").replace(/\.$/u, ""),
      );
      const pdf = bibField(bibText, it.id, "pdf");
      out.push(
        String.raw`  \CVPubI{${pdf ? href(pdf, title) : title}}{${venue}}{${year}}`,
      );
    }
    out.push(String.raw`\CVPubGroupEnd`);
  }
  return out.join("\n");
}

/** Pre-fetches GitHub stats for every project (slug → metric badges). */
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
 * Builds the full LaTeX document for one locale.
 *
 * @param {string} locale - `es` or `en`.
 * @param {{phone?: string}} [options] - `phone` adds a tel: contact item; it
 *   is only ever passed for the private build (see the module docblock).
 * @returns {Promise<string>} The LaTeX source.
 */
export async function buildDesign(locale, options = {}) {
  const meta = META[locale];
  const yamlPath = path.join(REPO_ROOT, `src/content/cv/${locale}.yaml`);
  const { basics, sections } = yaml.load(fs.readFileSync(yamlPath, "utf8"));
  const statsBySlug = await fetchProjectStats(sections, locale);
  const by = (kind) => sections.find((s) => s.kind === kind);

  const contact = [
    String.raw`\ContactEntry{\faMapMarker*}{${escapeLatex(basics.location ?? "Valencia, Spain")}}{}`,
    String.raw`\ContactEntry{\faAt}{${escapeLatex(basics.email)}}{mailto:${basics.email}}`,
    // Immediately after the email, like the ATS CVs: only present in the
    // private build.
    ...(options.phone
      ? [
          String.raw`\ContactEntry{\faPhone*}{${escapeLatex(options.phone)}}{tel:${options.phone.replaceAll(/[^+\d]/gu, "")}}`,
        ]
      : []),
    ...basics.links.map(
      (l) =>
        String.raw`\ContactEntry{${CONTACT_ICONS[l.kind] ?? String.raw`\faLink`}}{${escapeLatex(labelForContact(l))}}{${l.url}}`,
    ),
  ]
    .map((c) => `  ${c}%`)
    .join("\n");

  const doc = [
    designPreamble({
      babelLang: meta.babelLang,
      docLang: meta.docLang,
      pdfTitle: `${basics.name} — CV (${basics.headline})`,
      pdfSubject: meta.pdfSubject,
      pdfKeywords: meta.pdfKeywords,
    }),
    designHeader({
      name: escapeLatex(basics.name),
      headline: escapeLatex(basics.headline),
      tagline: (basics.objetivo ?? [])
        .map((o) => escapeLatex(o))
        .join(String.raw` \CVDot{} `),
      contact,
    }),
    String.raw`\begin{paracol}{2}`,
    // ═ main column ═
    String.raw`{\small ${markdownToLatex(basics.profile)}\par}`,
    renderExperience(by("experience")),
    renderProjects(by("projects"), statsBySlug),
    renderEducation(by("education")),
    String.raw`\switchcolumn`,
    // ═ sidebar ═ (its sections use the smaller SideSection style)
    String.raw`\let\CVSection\SideSection`,
    // Availability leads the sidebar, untitled: top of page one, where a
    // recruiter scans for work mode, without crowding the name or the
    // headline line (which barely fits in Spanish as it is).
    String.raw`{\footnotesize\color{muted}\faBriefcase~${escapeLatex(basics.availability ?? "")}\par}`,
    renderSkills(by("skills")),
    String.raw`\CVSection{${escapeLatex(meta.languagesTitle)}}`,
    (basics.idiomas ?? [])
      .map(
        (i) =>
          String.raw`\CVLang{${escapeLatex(i.name)}}{${escapeLatex(i.level)}}`,
      )
      .join("\n"),
    renderCertificates(by("certificates")),
    renderPublications(meta),
    String.raw`\end{paracol}`,
    String.raw`\end{document}`,
  ];
  return doc.join("\n") + "\n";
}

/** Output filenames keyed by locale. */
const OUTPUT_NAMES = {
  es: "CV_RequenaPlensJoseManuel_SPA.tex",
  en: "CV_RequenaPlensJoseManuel_ENG.tex",
};

/**
 * Writes both locales' sources into one directory.
 *
 * @param {string} outDir - Absolute destination directory.
 * @param {{phone?: string}} options - Passed through to `buildDesign`.
 */
async function writeSet(outDir, options) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const [locale, filename] of Object.entries(OUTPUT_NAMES)) {
    const outPath = path.join(outDir, filename);
    fs.writeFileSync(outPath, await buildDesign(locale, options), "utf8");
    console.log(`✓ ${path.relative(REPO_ROOT, outPath)}`);
  }
}

async function main() {
  const [argLocale] = process.argv.slice(2);
  if (argLocale) {
    process.stdout.write(await buildDesign(argLocale));
    return;
  }
  await writeSet(path.join(REPO_ROOT, "cv_latex", "generated"), {});
  if (CV_PHONE) {
    await writeSet(path.join(REPO_ROOT, "cv_private", "tex"), {
      phone: CV_PHONE,
    });
  }
}

// eslint-disable-next-line unicorn/no-top-level-side-effects -- CLI entry point
await main();
