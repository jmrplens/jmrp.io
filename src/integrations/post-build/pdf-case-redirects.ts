import fs from "node:fs";
import path from "node:path";

import type { AstroIntegrationLogger } from "astro";

import { assertNginxSafe, buildStampLine, writeNginxSnippet } from "./utils.js";

/**
 * Generates `pdf_case_redirects.conf`: a 301 from any case variant of a file
 * under `/pdf/` to the file's real name.
 *
 * The papers, the degree work and the CV ship with mixed-case names
 * (`/pdf/paper-resources/Conferences/Euronoise/plensEuro2021_2.pdf`,
 * `/pdf/degree/TFM_Master.pdf`), and some clients ask for them lowercased: the
 * log round of 2026-10-10 found one walking twelve of them, all 404. The
 * TFG poster had the same miss on 2026-09-14 and got a hand-written redirect;
 * this map covers every file, from the build output, so a renamed or new file
 * needs no Nginx edit.
 *
 * Two regex entries per file, and the pair is load-bearing. A plain string key
 * in an Nginx `map` is compared case-INsensitively (measured on an isolated
 * nginx, 2026-10-10: the key `/pdf/Conferences/plensEuro2021.pdf` matched
 * `/pdf/conferences/plenseuro2021.pdf` and `/PDF/CONFERENCES/...` alike), so
 * an exact-string exemption for the real name would swallow every variant and
 * the map would never redirect. Instead a case-SENSITIVE regex maps the real
 * name to "" (served as is) and a case-insensitive one maps everything else to
 * it. All exemptions come before all redirects: the first matching regex wins,
 * so no redirect regex can ever see a real name, and a 301 can never point at
 * itself.
 *
 * Two files whose names differ only in case would make the target ambiguous;
 * they keep their exemptions and get no redirect, with a warning.
 */
const MAP_VARIABLE = "$jmrp_pdf_case_redirect";

/** Precompressed siblings are not files anyone links to. */
const SKIPPED_EXTENSIONS = new Set([".br", ".gz"]);

/**
 * Escapes the regex metacharacters a file path can contain (`.` in every
 * extension, `+` or `(` in a future file name).
 *
 * @param value - A served path.
 * @returns The path, safe to embed in a regex.
 */
function escapeRegex(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

/**
 * Lists every file under `dist/pdf`, as the path it is served at.
 *
 * @param distDir - Build output directory.
 * @returns Served paths (`/pdf/...`), sorted.
 */
function collectPdfPaths(distDir: string): string[] {
  const root = path.join(distDir, "pdf");
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && !SKIPPED_EXTENSIONS.has(path.extname(entry.name)),
    )
    .map(
      (entry) =>
        "/" +
        path
          .relative(distDir, path.join(entry.parentPath, entry.name))
          .split(path.sep)
          .join("/"),
    )
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Builds the map body: exemptions for every real name, then one
 * case-insensitive redirect per name that has no case twin.
 *
 * @param paths - Served paths of every file under `/pdf/`.
 * @returns The map lines and the paths left without a redirect.
 */
export function buildPdfCaseEntries(paths: readonly string[]): {
  lines: string[];
  ambiguous: string[];
} {
  const byFolded = new Map<string, string[]>();
  for (const p of paths) {
    const folded = p.toLowerCase();
    byFolded.set(folded, [...(byFolded.get(folded) ?? []), p]);
  }
  const ambiguous = [...byFolded.values()]
    .filter((group) => group.length > 1)
    .flat();
  const exemptions = paths.map((p) => `    ~^${escapeRegex(p)}$  "";`);
  const redirects = paths
    .filter((p) => !ambiguous.includes(p))
    .map((p) => `    ~*^${escapeRegex(p)}$  "${p}";`);
  return { lines: [...exemptions, "", ...redirects], ambiguous };
}

/**
 * Writes the case-variant redirect map for every file under `/pdf/`.
 *
 * @param distDir - Build output directory, the INPUT this step reads.
 * @param stagingDir - Staging root for the generated Nginx snippets; the
 *   maps go in its `maps/` subdirectory, from where `deploy-live.mjs`
 *   moves them after the swap.
 * @param stamp - The per-build `# Build-Stamp:` banner, emitted verbatim as
 *   the snippet's second line.
 * @param logger - Astro integration logger.
 * @returns Resolves once the snippet has been written.
 */
export async function generatePdfCaseRedirects(
  distDir: string,
  stagingDir: string,
  stamp: string,
  logger: AstroIntegrationLogger,
): Promise<void> {
  const paths = collectPdfPaths(distDir);

  // File names come from public/pdf, but they are interpolated into quoted
  // Nginx map entries all the same, and this file is `include`d by the live
  // vhost. Same guard as the other generated maps.
  assertNginxSafe(paths, "files under dist/pdf");

  const { lines, ambiguous } = buildPdfCaseEntries(paths);
  for (const p of ambiguous) {
    logger.warn(
      `  ⚠ ${p}: another file differs from it only in case, so its case variants get no redirect.`,
    );
  }

  const content = `# GENERATED FILE: DO NOT EDIT.
${buildStampLine(stamp)}
# Written by src/integrations/post-build/pdf-case-redirects.ts on every build.
#
# 301 from any case variant of a file under /pdf/ to its real name: the
# papers and the CV ship with mixed-case names and some clients lowercase
# them. A case-sensitive regex exempts each real name, then a case-insensitive
# one redirects every other spelling to it; plain string keys are NOT usable
# here, because Nginx compares them case-insensitively.
#
# Included at http level; consumed inside \`location ^~ /pdf/\` as:
#     if (${MAP_VARIABLE}) { return 301 ${MAP_VARIABLE}; }
#
# Files: ${paths.length}

map $uri ${MAP_VARIABLE} {
    default "";

${lines.join("\n")}
}
`;

  // Staged like the other maps; see the note in blog-redirects.ts.
  const outPath = path.join(stagingDir, "maps", "pdf_case_redirects.conf");
  await writeNginxSnippet(outPath, content);
  logger.info(
    `  ✓ Staged ${outPath} (${paths.length - ambiguous.length} PDF case redirects)`,
  );
}
