import { execFileSync } from "node:child_process";

/**
 * Last time a source file actually changed, as an ISO date (`YYYY-MM-DD`).
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
 * @param repoRelativePath - Path from the repository root, e.g.
 *   "src/content/profile/about.yaml".
 * @returns ISO date string, or undefined when git cannot answer.
 */
export function lastCommitDate(repoRelativePath: string): string | undefined {
  try {
    const stdout = execFileSync(
      // eslint-disable-next-line sonarjs/no-os-command-from-path -- PATH is pinned below to /usr/bin:/bin, both root-owned
      "git",
      ["log", "-1", "--format=%cI", "--", repoRelativePath],
      {
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
    return stdout ? stdout.slice(0, 10) : undefined;
  } catch {
    return undefined;
  }
}
