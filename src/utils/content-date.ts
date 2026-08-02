import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/**
 * Repository root, resolved by checking candidates rather than assuming one.
 *
 * The paths callers pass are documented as repo-root-relative, so `git log`
 * has to run from the repo root for that contract to hold — and a mismatch
 * fails silently, because `git log -- <path>` returns an empty result rather
 * than an error, so every date would quietly become `undefined`.
 *
 * Two candidates, both of which are wrong in some context:
 *
 * - `process.cwd()` is the project root for every Astro build and every script
 *   run through pnpm, but nothing guarantees it in an unusual invocation.
 * - Walking up from `import.meta.url` is stable against the working directory,
 *   but NOT against bundling: this module is imported by `.astro` components,
 *   so Vite may relocate it and `../../` then points outside the repo
 *   entirely. Pinning to it alone silently disabled every date on /about/ and
 *   /privacy/ — observed, not hypothetical.
 *
 * So each candidate is validated by looking for `.git` (a directory in a normal
 * clone, a file in a worktree, hence `existsSync` rather than a stat on a dir),
 * and the first that holds up wins. `undefined` when neither does, which the
 * caller already handles by omitting the date.
 */
const REPO_ROOT = [
  fileURLToPath(new URL("../../", import.meta.url)),
  process.cwd(),
].find((candidate) => existsSync(path.join(candidate, ".git")));

/**
 * Last time a source file actually changed, as an ISO 8601 timestamp.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * `/about/` and `/privacy/` used to publish `dateModified: new Date()`, which
 * is the BUILD time. On this site `pnpm build` is also the deploy, so every
 * rebuild restamped both pages as "modified today" even when nothing in them
 * had changed — the two locales of /about/ were observed three seconds apart,
 * which is the giveaway. Google's guidance is explicit that a `dateModified`
 * which churns without content changes is worse than none at all, and it
 * devalues the property everywhere else on the site, including the blog posts
 * where the date is real.
 *
 * Git already records exactly the fact we want: the commit that last touched
 * the content source. It needs no new field to maintain and cannot drift from
 * the content, because it IS the content's history.
 *
 * ── Fallback ─────────────────────────────────────────────────────────────
 * Returns `undefined` when git is unavailable or the file has no history (a
 * shallow CI checkout, an unpublished working copy). Callers must omit
 * `dateModified` in that case rather than substituting the build time: an
 * absent freshness signal is honest, a fabricated one is not.
 *
 * ── Precision ────────────────────────────────────────────────────────────
 * The full ISO timestamp, not a truncated `YYYY-MM-DD`. schema.org accepts
 * either, but every other `dateModified` on this site is a datetime, and git
 * already knows the commit time — throwing that precision away would make this
 * one property inconsistent with the rest of the graph for no gain.
 *
 * @param repoRelativePath - Path from the repository root, e.g.
 *   "src/content/profile/about.yaml".
 * @returns ISO 8601 timestamp, or undefined when git cannot answer.
 */
export function lastCommitDate(repoRelativePath: string): string | undefined {
  if (!REPO_ROOT) return undefined;
  try {
    const stdout = execFileSync(
      // eslint-disable-next-line sonarjs/no-os-command-from-path -- PATH is pinned below to /usr/bin:/bin, both root-owned
      "git",
      ["log", "-1", "--format=%cI", "--", repoRelativePath],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        // Resolve `git` only through root-owned directories, so the binary
        // cannot be shadowed by a writable PATH entry inherited from the
        // build shell. Same rationale and same value as `DEFAULT_SECURE_PATH`
        // in `scripts/deploy-live.mjs`. The rule below cannot see that the
        // PATH is a hard-coded literal of exactly those two directories, which
        // is precisely what it asks for.
        env: { ...process.env, PATH: "/usr/bin:/bin" }, // NOSONAR
      },
    ).trim();
    // An empty result means the path is untracked or has no commits — not an
    // error, but not a date either.
    return stdout ? new Date(stdout).toISOString() : undefined;
  } catch {
    return undefined;
  }
}
