/**
 * Unit tests for the end-of-deploy notice about CV PDFs that `build:cv`
 * rebuilt and git does not have yet (GEO audit #11). Git is never run: the
 * status text and the runner are injected.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  detectUncommittedDeployFiles,
  findUncommittedDeployFiles,
  formatDeployNotice,
  GIT_STATUS_ARGS,
  parsePorcelainZ,
} from "./cv-pdf-notice.mjs";

const PDFS = [
  "public/pdf/CV_RequenaPlensJoseManuel_ENG.pdf",
  "public/pdf/CV_RequenaPlensJoseManuel_ENG_ATS.pdf",
  "public/pdf/CV_RequenaPlensJoseManuel_ENG_ATS_EXT.pdf",
  "public/pdf/CV_RequenaPlensJoseManuel_SPA.pdf",
  "public/pdf/CV_RequenaPlensJoseManuel_SPA_ATS.pdf",
  "public/pdf/CV_RequenaPlensJoseManuel_SPA_ATS_EXT.pdf",
];

/**
 * `git status --porcelain=v1 -z` output for the given entries.
 *
 * @param {string[]} entries - Raw "XY path" fields (and rename origins).
 * @returns {string} NUL-terminated fields.
 */
function porcelain(entries) {
  return entries.map((entry) => `${entry}\0`).join("");
}

test("finds the six PDFs a deploy leaves modified, in git's order", () => {
  // What `git status` printed on the production host after the 2026-09-30
  // deploy.
  const text = porcelain(PDFS.map((file) => ` M ${file}`));
  assert.deepEqual(
    findUncommittedDeployFiles(text),
    PDFS.map((file) => ({ path: file, kind: "pdf", state: "modified" })),
  );
});

test("names untracked, staged, deleted and renamed PDFs", () => {
  const text = porcelain([
    "?? public/pdf/CV_New.pdf",
    "M  public/pdf/CV_Staged.pdf",
    "A  public/pdf/CV_Added.pdf",
    " D public/pdf/CV_Gone.pdf",
    // -z puts a rename's origin in a field of its own, after the new path.
    "R  public/pdf/CV_To.pdf",
    "public/pdf/CV_From.pdf",
    "MM public/pdf/CV_Both.pdf",
  ]);
  assert.deepEqual(findUncommittedDeployFiles(text), [
    { path: "public/pdf/CV_New.pdf", kind: "pdf", state: "untracked" },
    { path: "public/pdf/CV_Staged.pdf", kind: "pdf", state: "modified" },
    { path: "public/pdf/CV_Added.pdf", kind: "pdf", state: "added" },
    { path: "public/pdf/CV_Gone.pdf", kind: "pdf", state: "deleted" },
    { path: "public/pdf/CV_To.pdf", kind: "pdf", state: "renamed" },
    { path: "public/pdf/CV_Both.pdf", kind: "pdf", state: "modified" },
  ]);
});

test("ignores anything that is not a CV PDF directly under public/pdf", () => {
  const text = porcelain([
    " M public/pdf/other.pdf",
    " M public/pdf/archive/CV_Old.pdf",
    " M public/pdf/CV_Notes.txt",
    " M src/content/cv/main.yaml",
    "?? public/pdf/CV_draft.pdf.bak",
  ]);
  assert.deepEqual(findUncommittedDeployFiles(text), []);
  assert.deepEqual(findUncommittedDeployFiles(""), []);
});

test("parsePorcelainZ keeps paths with spaces whole and skips rename origins", () => {
  assert.deepEqual(
    parsePorcelainZ(
      porcelain(["C  public/pdf/CV a.pdf", "public/pdf/CV b.pdf", "?? x y"]),
    ),
    [
      { xy: "C ", path: "public/pdf/CV a.pdf" },
      { xy: "??", path: "x y" },
    ],
  );
});

test("detectUncommittedDeployFiles asks git only inside a work tree", () => {
  const calls = [];
  const outside = detectUncommittedDeployFiles((args) => {
    calls.push(args);
    return { status: 128, stdout: "", stderr: "fatal: not a git repository" };
  });
  assert.equal(outside, null);
  assert.deepEqual(calls, [["rev-parse", "--is-inside-work-tree"]]);

  // git missing altogether: spawnSync reports an error, not a status.
  assert.equal(
    detectUncommittedDeployFiles(() => ({
      status: null,
      stdout: null,
      error: new Error("spawnSync git ENOENT"),
    })),
    null,
  );

  const inside = detectUncommittedDeployFiles((args) =>
    args[0] === "rev-parse"
      ? { status: 0, stdout: "true\n" }
      : { status: 0, stdout: porcelain([` M ${PDFS[0]}`]) },
  );
  assert.deepEqual(inside, [{ path: PDFS[0], kind: "pdf", state: "modified" }]);
});

test("detectUncommittedDeployFiles runs the documented status and throws when it fails", () => {
  const calls = [];
  assert.throws(
    () =>
      detectUncommittedDeployFiles((args) => {
        calls.push(args);
        return args[0] === "rev-parse"
          ? { status: 0, stdout: "true\n" }
          : { status: 129, stdout: "" };
      }),
    /git status failed \(exit code 129\)/,
  );
  assert.deepEqual(calls[1], [...GIT_STATUS_ARGS]);
  assert.deepEqual(GIT_STATUS_ARGS, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--",
    "public/pdf",
    "src/assets/achievements",
  ]);
});

test("formatDeployNotice lists the files and the exact commit commands", () => {
  const lines = formatDeployNotice(
    [
      { path: PDFS[0], kind: "pdf", state: "modified" },
      { path: "public/pdf/CV_New.pdf", kind: "pdf", state: "untracked" },
    ],
    { root: "/var/www/jmrp.io", date: new Date("2026-09-30T17:20:00Z") },
  );
  assert.match(lines[0], /2 CV PDF\(s\) under public\/pdf\/ are not committed/);
  assert.ok(lines.includes(`    modified   ${PDFS[0]}`));
  assert.ok(lines.includes("    untracked  public/pdf/CV_New.pdf"));
  assert.ok(
    lines.includes(
      `    git -C /var/www/jmrp.io add -- ${PDFS[0]} public/pdf/CV_New.pdf`,
    ),
  );
  assert.ok(
    lines.includes(
      `    git -C /var/www/jmrp.io commit -m "chore: refresh the CV PDFs from the 2026-09-30 deploy" -- ${PDFS[0]} public/pdf/CV_New.pdf`,
    ),
  );
  for (const line of lines) assert.doesNotMatch(line, /\u{2014}/u);
});

test("formatDeployNotice quotes what a shell would split", () => {
  const lines = formatDeployNotice(
    [{ path: "public/pdf/CV_It's mine.pdf", kind: "pdf", state: "untracked" }],
    { root: "/srv/my site", date: new Date("2026-09-30T00:00:00Z") },
  );
  assert.ok(
    lines.some((line) =>
      line.startsWith(
        String.raw`    git -C '/srv/my site' add -- 'public/pdf/CV_It'\''s mine.pdf'`,
      ),
    ),
  );
});

test("badges are found, other assets are not (GEO audit #12, L4)", () => {
  const text = porcelain([
    "?? src/assets/achievements/gitlab-level-4-contributor.png",
    " M src/assets/achievements/nested/x.png",
    " M src/assets/achievements/README.md",
    " M src/assets/other.png",
  ]);
  assert.deepEqual(findUncommittedDeployFiles(text), [
    {
      path: "src/assets/achievements/gitlab-level-4-contributor.png",
      kind: "badge",
      state: "untracked",
    },
  ]);
});

test("one notice and one commit cover both groups", () => {
  const lines = formatDeployNotice(
    [
      { path: PDFS[0], kind: "pdf", state: "modified" },
      {
        path: "src/assets/achievements/gitlab-level-4-contributor.png",
        kind: "badge",
        state: "untracked",
      },
    ],
    { root: "/var/www/jmrp.io", date: new Date("2026-10-10T08:00:00Z") },
  );
  assert.match(
    lines[0],
    /1 CV PDF\(s\) under public\/pdf\/ and 1 achievement badge\(s\) under src\/assets\/achievements\//,
  );
  assert.ok(
    lines.some((line) =>
      line.includes(
        'commit -m "chore: refresh the CV PDFs and achievement badges from the 2026-10-10 deploy"',
      ),
    ),
  );
  assert.equal(lines.filter((line) => line.includes(" commit -m ")).length, 1);
});

test("a badges-only deploy names only the badges", () => {
  const lines = formatDeployNotice(
    [
      {
        path: "src/assets/achievements/a.png",
        kind: "badge",
        state: "modified",
      },
    ],
    { root: "/r", date: new Date("2026-10-10T08:00:00Z") },
  );
  assert.doesNotMatch(lines[0], /CV PDF/);
  assert.ok(
    lines.some((l) =>
      l.includes(
        '"chore: refresh achievement badges from the 2026-10-10 deploy"',
      ),
    ),
  );
});
