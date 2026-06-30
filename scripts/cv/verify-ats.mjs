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
 *     (deterministic, no LLM, no network) above a floor.
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
  linkedin: /linkedin\.com\/in\/jmrplens/i,
  orcid: /0000-0003-1250-6212/i,
  scholar: /scholar|google scholar/i,
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

/** Entry point: validates every target PDF and exits non-zero on failure. */
async function main() {
  let failed = 0;
  console.log(
    `${c.dim}ATS check on ${TARGETS.length} generated CV PDFs (pdf-parse + ats-checker)${c.reset}`,
  );

  for (const { file, profile, locale } of TARGETS) {
    const full = path.join(PDF_DIR, file);
    if (!fs.existsSync(full)) {
      console.log(`  ${c.red}✗${c.reset} ${file} — file not found`);
      failed += 1;
      continue;
    }
    let result;
    try {
      const text = await extractText(file);
      result = checkPdf(text, profile, locale);
    } catch (error) {
      console.log(
        `  ${c.red}✗${c.reset} ${file} — extraction error: ${error.message}`,
      );
      failed += 1;
      continue;
    }
    const { failures, score, keywords } = result;
    const scoreLabel = locale === "en" ? `, score ${score.toFixed(0)}` : "";
    if (failures.length === 0) {
      console.log(
        `  ${c.green}✓${c.reset} ${file} ${c.dim}(${profile}, ${keywords}/${TARGET_KEYWORDS.length} keywords${scoreLabel})${c.reset}`,
      );
    } else {
      failed += 1;
      console.log(
        `  ${c.red}✗${c.reset} ${file} ${c.dim}(${profile})${c.reset}`,
      );
      for (const f of failures) console.log(`      ${c.red}- ${f}${c.reset}`);
    }
  }

  if (failed > 0) {
    console.log(`${c.red}ATS check failed for ${failed} file(s).${c.reset}`);
    process.exit(1);
  }
  console.log(`${c.green}All CV PDFs are ATS-compatible.${c.reset}`);
}

await main();
