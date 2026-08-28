/**
 * ATS compatibility check for the generated CV PDFs.
 *
 * Runs as part of `pnpm verify`. Extracts text from each generated ATS PDF with
 * `pdf-parse` (pure JS — works in CI without Python/poppler) and asserts the
 * deterministic properties a real Applicant Tracking System relies on:
 *   - a real text layer (selectable text, not an image),
 *   - the candidate name on the first line,
 *   - every expected section heading maps to a canonical ATS section,
 *   - contact + profile links are present (email, web, GitHub, LinkedIn, ORCID, Scholar),
 *   - no mojibake / replacement characters,
 *   - a keyword/skills coverage score from `@pranavraut033/ats-checker`
 *     (deterministic, no LLM, no network) above a floor,
 *   - every font the ATS sources pin is glyf-flavoured TrueType (see below).
 *
 * ── Why a font check sits in an ATS test ──────────────────────────────────
 * Because the only defect that ever actually broke these CVs was invisible to
 * every check above it. Inter's system build is OTF/CFF at 2048 units per em,
 * so the embedded font carries its own FontMatrix of 1/2048 instead of the
 * 1/1000 that CFF almost always uses. Poppler, MuPDF, pypdf and the pdf-parse
 * used here all honour it and extract the text perfectly — this file reported
 * "19/20 keywords, score 84" the whole time. Affinda's commercial resume
 * parser does not: it scales advances by the 1000 it assumes, drifts behind
 * the real glyph positions, and emits the drift as spaces. It read
 * "E m bedded fi rmwa re a nd softwa re eng i neer", found 55 skills instead
 * of 76, and extracted ZERO work-experience entries from the concise EN CV.
 *
 * So there is no output-level assertion that can catch this locally: the local
 * text layer is correct. The check has to pin the cause instead — the sources
 * must resolve Inter from the vendored TrueType files, never from whatever
 * OTF the machine happens to have installed.
 *
 * Exits non-zero on any regression so the build fails.
 *
 * @module
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { analyzeResume } from "@pranavraut033/ats-checker";
import { PDFParse } from "pdf-parse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_DIR = path.resolve(__dirname, "..", "..", "public", "pdf");

const c = {
  reset: "[0m",
  red: "[31m",
  green: "[32m",
  yellow: "[33m",
  dim: "[2m",
};

/** Canonical ATS sections → recognised synonyms (EN + ES, accent-insensitive). */
const SECTION_SYNONYMS = {
  summary: ["summary", "profile", "objective", "perfil", "resumen"],
  experience: ["experience", "employment", "experiencia"],
  skills: ["skills", "competencies", "competencias", "habilidades"],
  projects: ["projects", "proyectos"],
  education: ["education", "academic", "formacion", "educacion"],
  certifications: ["certifications", "certificates", "certificados", "cursos"],
  publications: ["publications", "research", "publicaciones"],
};

/** Contact / profile signals every CV must expose for ATS ingestion. */
const CONTACT = {
  email: /jmrplens@gmail\.com/i,
  web: /jmrp\.io/i,
  github: /github\.com\/jmrplens/i,
  // Official collaborator on GitLab's repos; added 2026-08-26. Scholar was
  // dropped from the PDFs the same day (author's call: it stays on the web
  // page and its schema; the publications section carries the signal here).
  gitlab: /gitlab\.com\/jmrp\b/i,
  linkedin: /linkedin\.com\/in\/jmrplens/i,
  orcid: /0000-0003-1250-6212/i,
};

/** Language-agnostic, technical job description used as the scoring reference. */
const TARGET_JD =
  "Firmware and software engineer. Required skills: C, C++, Python, Go, " +
  "STM32, ESP32, FreeRTOS, RTOS, Modbus, embedded systems, firmware, QA, " +
  "quality assurance, CI/CD, Docker, SonarQube, Git, TLS, WireGuard, pytest.";

// ats-checker's composite score parses experience/education in English, so it
// is only meaningful for the EN CVs. The keyword floor below is language-agnostic
// (the terms are identical in ES/EN) and gates both.
const SCORE_FLOOR = 55; // EN composite score (catches gross regressions).
const KEYWORD_FLOOR = 14; // of TARGET_KEYWORDS that must appear in the text.

/** Target technical keywords an ATS scans for (identical token in ES + EN). */
const TARGET_KEYWORDS = [
  /\bfirmware\b/i,
  /\bembedded\b/i,
  /\bembebido\b/i,
  /\bSTM32\b/i,
  /\bESP32\b/i,
  /\bFreeRTOS\b/i,
  /\bRTOS\b/i,
  /\bModbus\b/i,
  /\bPython\b/i,
  /\bpytest\b/i,
  /\bGo\b/,
  /C\+\+/,
  /\bCI\/CD\b/i,
  /\bSonarQube\b/i,
  /\bDocker\b/i,
  /\bWireGuard\b/i,
  /\bTLS\b/i,
  /\bGit\b/i,
  /\bBash\b/i,
  /\bQA\b/i,
];

/** Each generated ATS PDF + its profile and locale. */
const TARGETS = [
  {
    file: "CV_RequenaPlensJoseManuel_SPA_ATS.pdf",
    profile: "concise",
    locale: "es",
  },
  {
    file: "CV_RequenaPlensJoseManuel_SPA_ATS_EXT.pdf",
    profile: "full",
    locale: "es",
  },
  {
    file: "CV_RequenaPlensJoseManuel_ENG_ATS.pdf",
    profile: "concise",
    locale: "en",
  },
  {
    file: "CV_RequenaPlensJoseManuel_ENG_ATS_EXT.pdf",
    profile: "full",
    locale: "en",
  },
];

const SECTIONS_CONCISE = [
  "summary",
  "experience",
  "skills",
  "projects",
  "education",
];
const SECTIONS_FULL = [...SECTIONS_CONCISE, "certifications", "publications"];

/** Removes diacritics + lowercases for accent-insensitive matching. */
function fold(s) {
  return s.normalize("NFD").replaceAll(/[̀-ͯ]/g, "").toLowerCase();
}

/** Extracts the plain-text layer from a PDF file. */
async function extractText(file) {
  const buffer = fs.readFileSync(path.join(PDF_DIR, file));
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const { text } = await parser.getText();
    return text;
  } finally {
    await parser.destroy();
  }
}

/** Runs every assertion for one PDF, returning a list of failure messages. */
function checkPdf(text, profile, locale) {
  const failures = [];
  const folded = fold(text);

  if (text.trim().split(/\s+/).length < 200) {
    failures.push("text layer too small (no selectable text?)");
  }

  const firstLine = text.trim().split(/\r?\n/, 1)[0] ?? "";
  if (!/requena plens/i.test(firstLine)) {
    failures.push(`name not on first line (got: "${firstLine.slice(0, 40)}")`);
  }

  const expected = profile === "full" ? SECTIONS_FULL : SECTIONS_CONCISE;
  for (const section of expected) {
    const hit = SECTION_SYNONYMS[section].some((syn) =>
      folded.includes(fold(syn)),
    );
    if (!hit) failures.push(`section not detected: ${section}`);
  }

  for (const [name, re] of Object.entries(CONTACT)) {
    if (!re.test(text)) failures.push(`contact link missing: ${name}`);
  }

  if (/\u{FFFD}/u.test(text))
    failures.push("mojibake / replacement character found");

  // Language-agnostic keyword coverage (gates both locales).
  const keywords = TARGET_KEYWORDS.filter((re) => re.test(text)).length;
  if (keywords < KEYWORD_FLOOR) {
    failures.push(
      `keyword coverage ${keywords}/${TARGET_KEYWORDS.length} below floor ${KEYWORD_FLOOR}`,
    );
  }

  // ats-checker composite score — only meaningful for the English CVs.
  const { score } = analyzeResume({
    resumeText: text,
    jobDescription: TARGET_JD,
  });
  if (locale === "en" && score < SCORE_FLOOR) {
    failures.push(
      `ATS composite score ${score.toFixed(0)} below floor ${SCORE_FLOOR}`,
    );
  }

  return { failures, score, keywords };
}

/** Directory holding the generated ATS `.tex` sources. */
const GEN_DIR = path.resolve(__dirname, "..", "..", "cv_latex", "generated");

/**
 * Reads an sfnt table directory and reports which outline table it carries.
 *
 * @param {string} file - Absolute path to a font file.
 * @returns {"glyf"|"CFF"|"unreadable"} Which outline format the font uses.
 */
function outlineFormat(file) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const head = Buffer.alloc(12);
    if (fs.readSync(fd, head, 0, 12, 0) < 12) return "unreadable";
    const numTables = head.readUInt16BE(4);
    const dir = Buffer.alloc(16 * numTables);
    fs.readSync(fd, dir, 0, dir.length, 12);
    const tags = new Set();
    for (let i = 0; i < numTables; i += 1) {
      tags.add(dir.toString("latin1", i * 16, i * 16 + 4));
    }
    if (tags.has("CFF ")) return "CFF";
    if (tags.has("glyf")) return "glyf";
    return "unreadable";
  } catch {
    return "unreadable";
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Verifies one `\setmainfont`/`\newfontfamily` declaration.
 *
 * A family must be pinned to a vendored file — `Path` plus `Extension` — or
 * LaTeX resolves it from the system font database, which is what silently
 * changed the shipped typeface once already. Each pinned face must also exist
 * on disk and carry glyf outlines: CFF is what made ATS parsers read the PDF
 * as broken words.
 *
 * @param {string} texName - Basename of the generated source, for messages.
 * @param {string} family - The font family as declared.
 * @param {string} options - The bracketed option list of the declaration.
 * @returns {string[]} Failure messages, empty when the family is sound.
 */
function checkFontFamily(texName, family, options) {
  const dir = /Path\s*=\s*([^,\]\n]+)/u.exec(options)?.[1]?.trim();
  const ext = /Extension\s*=\s*([^,\]\n]+)/u.exec(options)?.[1]?.trim();
  if (!dir || !ext) {
    return [
      `${texName} — ${family} is not pinned to a vendored file ` +
        `(no Path/Extension); it would resolve from the system font database`,
    ];
  }
  const failures = [];
  for (const [, suffix] of options.matchAll(/=\s*\*(-\w+)/gu)) {
    const resolved = path.resolve(GEN_DIR, dir, `${family}${suffix}${ext}`);
    if (!fs.existsSync(resolved)) {
      failures.push(`${texName} — missing font file ${family}${suffix}${ext}`);
      continue;
    }
    const format = outlineFormat(resolved);
    if (format !== "glyf") {
      failures.push(
        `${texName} — ${family}${suffix}${ext} is ${format}, not glyf-flavoured TrueType`,
      );
    }
  }
  return failures;
}

/**
 * Asserts every generated ATS source pins its fonts to vendored TrueType files.
 *
 * @returns {string[]} Failure messages, empty when every source is pinned.
 */
function checkFontPinning() {
  const failures = [];
  for (const { file } of TARGETS) {
    const tex = path.join(GEN_DIR, file.replace(/\.pdf$/u, ".tex"));
    if (!fs.existsSync(tex)) {
      failures.push(`${path.basename(tex)} — generated source not found`);
      continue;
    }
    const source = fs.readFileSync(tex, "utf8");
    const blocks = [
      ...source.matchAll(
        /\\(?:setmainfont|newfontfamily\\\w+)\{([^}]+)\}\[([^\]]*)\]/gu,
      ),
    ];
    if (blocks.length === 0) {
      failures.push(`${path.basename(tex)} — no font declarations found`);
      continue;
    }
    for (const [, family, options] of blocks) {
      failures.push(...checkFontFamily(path.basename(tex), family, options));
    }
  }
  return failures;
}

/** The design (sidebar) PDFs and the page budget they must not exceed. */
const DESIGN_TARGETS = [
  "CV_RequenaPlensJoseManuel_ENG.pdf",
  "CV_RequenaPlensJoseManuel_SPA.pdf",
];
const DESIGN_MAX_PAGES = 3;

/**
 * Guards the design CVs against the half-empty-page regression.
 *
 * The retired AltaCV layout wasted 21-67% of every page because `\needspace`
 * and per-item `minipage` wrappers moved whole blocks to the next page; the
 * symptom of that entire failure class is PAGE COUNT GROWTH (6 pages for
 * content that fits in 3). Exact per-page fill needs glyph positions, which
 * pure-JS extraction does not expose reliably, so the check pins the budget
 * instead: both design PDFs must stay within DESIGN_MAX_PAGES and carry a real
 * text layer. Raise the budget deliberately when content grows, not to
 * silence a layout regression.
 *
 * @returns {Promise<string[]>} Failure messages, empty when within budget.
 */
async function checkDesignBudget() {
  const failures = [];
  for (const file of DESIGN_TARGETS) {
    const full = path.join(PDF_DIR, file);
    if (!fs.existsSync(full)) {
      failures.push(`${file} — file not found`);
      continue;
    }
    const buffer = fs.readFileSync(full);
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const { text, total } = await parser.getText();
      const pages = total ?? (text.match(/\f/gu)?.length ?? 0) + 1;
      if (pages > DESIGN_MAX_PAGES) {
        failures.push(
          `${file} — ${pages} pages exceeds the ${DESIGN_MAX_PAGES}-page budget (layout regression?)`,
        );
      }
      if (text.trim().split(/\s+/u).length < 300) {
        failures.push(`${file} — text layer too small`);
      }
    } catch (error) {
      failures.push(`${file} — extraction error: ${error.message}`);
    } finally {
      await parser.destroy();
    }
  }
  return failures;
}

/**
 * Prints the verdict of one whole-run check and reports whether it failed.
 *
 * @param {string} label - The check's name.
 * @param {string[]} failures - Its failure messages, empty when it passed.
 * @param {string} okNote - Parenthetical shown when it passed.
 * @returns {number} 1 when the check failed, 0 when it passed.
 */
function reportGroup(label, failures, okNote) {
  if (failures.length === 0) {
    console.log(
      `  ${c.green}✓${c.reset} ${label} ${c.dim}(${okNote})${c.reset}`,
    );
    return 0;
  }
  console.log(`  ${c.red}✗${c.reset} ${label}`);
  for (const f of failures) console.log(`      ${c.red}- ${f}${c.reset}`);
  return 1;
}

/**
 * Extracts one generated PDF and prints its ATS verdict.
 *
 * @param {{file: string, profile: string, locale: string}} target - The PDF.
 * @returns {Promise<number>} 1 when it failed, 0 when it passed.
 */
async function reportPdf({ file, profile, locale }) {
  if (!fs.existsSync(path.join(PDF_DIR, file))) {
    console.log(`  ${c.red}✗${c.reset} ${file} — file not found`);
    return 1;
  }
  let result;
  try {
    result = checkPdf(await extractText(file), profile, locale);
  } catch (error) {
    console.log(
      `  ${c.red}✗${c.reset} ${file} — extraction error: ${error.message}`,
    );
    return 1;
  }
  const { failures, score, keywords } = result;
  if (failures.length === 0) {
    const scoreLabel = locale === "en" ? `, score ${score.toFixed(0)}` : "";
    console.log(
      `  ${c.green}✓${c.reset} ${file} ${c.dim}(${profile}, ${keywords}/${TARGET_KEYWORDS.length} keywords${scoreLabel})${c.reset}`,
    );
    return 0;
  }
  console.log(`  ${c.red}✗${c.reset} ${file} ${c.dim}(${profile})${c.reset}`);
  for (const f of failures) console.log(`      ${c.red}- ${f}${c.reset}`);
  return 1;
}

/** Entry point: validates every target PDF and exits non-zero on failure. */
async function main() {
  let failed = 0;
  console.log(
    `${c.dim}ATS check on ${TARGETS.length} generated CV PDFs (pdf-parse + ats-checker)${c.reset}`,
  );

  failed += reportGroup(
    "design budget",
    await checkDesignBudget(),
    `both sidebar CVs within ${DESIGN_MAX_PAGES} pages`,
  );
  failed += reportGroup(
    "font pinning",
    checkFontPinning(),
    "all sources resolve vendored TrueType",
  );

  for (const target of TARGETS) {
    failed += await reportPdf(target);
  }

  if (failed > 0) {
    console.log(`${c.red}ATS check failed for ${failed} file(s).${c.reset}`);
    process.exit(1);
  }
  console.log(`${c.green}All CV PDFs are ATS-compatible.${c.reset}`);
}

await main();
