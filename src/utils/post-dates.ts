import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/**
 * `dateModified` for blog posts, computed instead of remembered.
 *
 * ── Why ──────────────────────────────────────────────────────────────────
 * /about/#editorial promises that a fix changing the technical substance
 * updates the article's revision date. `updatedDate` is a hand-maintained
 * field, so that promise held only as long as nobody forgot — and commit
 * 205d494, the full remediation of the fourth GEO audit, edited 25 post files
 * and moved `updatedDate` on 4. The other 21 shipped a revision date
 * that was wrong by the site's own published policy.
 *
 * `lastVerified.date` had the mirror-image problem. It is the strongest
 * freshness claim on the page — re-tested on this date, against these
 * versions — and it reached no machine-readable surface at all: post 011
 * advertised `dateModified: 2026-06-16` while the page itself said the
 * instructions were verified on 2026-08-22. A 67-day understatement of a
 * post's own freshness, legible to a reader and invisible to a crawler.
 *
 * ── The rule ─────────────────────────────────────────────────────────────
 *   dateModified = max(publishedDate, updatedDate?, lastVerified.date?,
 *                      last substantive commit touching the file)
 *
 * Every term is a real modification of what the page asserts, so the maximum
 * is the honest answer and no term can drag the date backwards. The build
 * clock is never a term: on this site `pnpm build` IS the deploy, and a
 * `dateModified` that moves on every deploy is worth less than none — the
 * reasoning already written down in `@utils/content-date`.
 *
 * The commit that CREATES a post is excluded, by dropping any commit dated on
 * or before the day of `publishedDate`. Zod coerces `publishedDate` to
 * midnight UTC while the creation commit carries the real time of day, so
 * without that guard every new post would be born advertising a revision it
 * never had — "Updated" on its own publication day.
 *
 * ── Which commits count ──────────────────────────────────────────────────
 * Read off the conventional-commit subject, because the policy this
 * implements already distinguishes a substantive fix from a typo, and the
 * commit message is where that distinction is written down:
 *
 *   - `build`, `chore`, `ci`, `deps`, `docs`, `i18n`, `perf`, `refactor`,
 *     `style`, `test` never move the date. None of them changes what the
 *     article claims, and `refactor`/`style` are the rewording lane. Letting
 *     them through would churn 24 sitemap entries and re-submit them to
 *     IndexNow for a comma.
 *   - `feat`, `fix`, `content`, `revert`, and anything marked breaking
 *     (`type!:`) do move it.
 *   - A subject with no recognizable type moves it. The unlabelled commits
 *     in this repo are old and real — e0bd7bc removed two fully embedded
 *     tools from post 003 — so assuming they are trivial would hide genuine
 *     edits, while the opposite assumption only risks a date slightly too
 *     fresh.
 *
 * The type alone cannot see everything: a site-wide `feat(llms)` sweep that
 * only adds ```text fences is not a revision of the article, and a `fix:` that
 * repairs one letter of an aria-label is not one either. So an explicit
 * per-commit override wins over the type, in both directions:
 *
 *     Content-Bump: skip     # mechanical pass, leave every date alone
 *     Content-Bump: force    # yes, this really did revise the articles
 *
 * `[skip-bump]` anywhere in the subject is shorthand for the first. Every
 * commit reaches `main` through a GitHub squash merge, so the marker has to be
 * typed into the squash message box at merge time — a trailer written on a
 * branch commit does not survive. See CLAUDE.md, "Writing Blog Posts".
 *
 * ── Fallback ─────────────────────────────────────────────────────────────
 * With no `git`, no `.git`, a SHALLOW checkout, or a post that is not
 * committed yet, the git term is simply absent and the formula falls back to
 * frontmatter. Nothing is fabricated and nothing throws.
 */

/**
 * The frontmatter fields the formula reads.
 *
 * Deliberately not `CollectionEntry<"posts">`: `sitemap-post-dates.ts` calls
 * this from inside `astro.config.mjs`, where `astro:content` does not exist,
 * and hands over YAML it parsed itself.
 */
export interface PostDateFields {
  publishedDate: Date | string;
  updatedDate?: Date | string;
  lastVerified?: { date?: Date | string; versions?: string[] };
}

/** Every path this module answers for lives under here. */
const POSTS_PREFIX = "src/content/posts/";

// Record/field/header separators for the single `git log` invocation. Control
// characters, not punctuation, so a commit subject cannot forge one. Written as
// escapes rather than as literal control characters: the literals are invisible
// in review and do not survive copy/paste or a reformat. NUL is unusable here:
// it cannot travel inside an argv entry at all, so `--format` never sees it.
const RECORD_SEP = "\u{1}";
const FIELD_SEP = "\u{1F}";
const HEADER_SEP = "\u{1E}";

/** Conventional-commit types that never move a post's revision date. */
const COSMETIC_TYPES = new Set([
  "build",
  "chore",
  "ci",
  "deps",
  "docs",
  "i18n",
  "perf",
  "refactor",
  "style",
  "test",
]);

/**
 * Site-wide mechanical passes that predate the `Content-Bump:` trailer.
 *
 * Checked one by one against their own diff to `src/content/posts/`. The list
 * is CLOSED: anything new declares itself in its own commit message, which is
 * where the knowledge is. It is not a fan-out heuristic — that was tried and
 * rejected, because the genuinely substantive 205d494 touched 25 post files
 * while the purely mechanical f2eb953 touched 8.
 */
const MECHANICAL_COMMITS = new Set([
  // fix #421 — the only edits to posts are a doubled fragment inside one
  // `ariaLabel` ("prerequisprerequisite") and the removal of an
  // `OrderedCompare title=` that repeated the `###` directly above it, in both
  // locales of post 011. Typed `fix:` and therefore substantive by the rule
  // above, but it is exactly the "simply fixed" case: without this entry post
  // 011 would advertise a revision dated four days after the re-verification
  // its own page shows, fixed by a typo rather than by a re-test.
  "30ea9282442c779d2eef41e924ab914d44619119",
  // feat(a11y) #415 — added rel="external noopener noreferrer" to raw anchors.
  "3002c010f224e20f0107db6c112795651b7e8946",
  // feat(llms) #417 — added ```text fences so the MDX→markdown converter could
  // see the blocks. It also localized two ES chart labels, but both posts
  // already carry a later date from another term of the formula.
  "f2eb953ebaf23d4485fde002b98cc038c3fe7b1c",
]);

/**
 * Repository root, resolved by checking candidates rather than assuming one.
 *
 * Same two-candidate mechanism, and the same reasoning, as `REPO_ROOT` in
 * `@utils/content-date`: `process.cwd()` is the project root for every Astro
 * build but nothing guarantees it in an unusual invocation, while walking up
 * from `import.meta.url` is stable against the working directory and not
 * against bundling. Each candidate is validated by looking for `.git` (a
 * directory in a normal clone, a FILE in a worktree, hence `existsSync`), and
 * the first that holds up wins.
 *
 * Getting this wrong fails silently — `git log -- <path>` from outside the
 * repo returns an empty result, not an error — which is why it is checked
 * rather than assumed.
 */
const REPO_ROOT = [
  fileURLToPath(new URL("../../", import.meta.url)),
  process.cwd(),
].find((candidate) => existsSync(path.join(candidate, ".git")));

/**
 * Runs `git` in the repo root and returns its stdout, or undefined on failure.
 *
 * @param args - Arguments after the `git` executable.
 * @returns Raw stdout, or undefined when git cannot answer.
 */
function git(args: string[]): string | undefined {
  if (!REPO_ROOT) return undefined;
  try {
    return execFileSync(
      // eslint-disable-next-line sonarjs/no-os-command-from-path -- PATH is pinned below to /usr/bin:/bin, both root-owned
      "git",
      args,
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
        // Root-owned PATH only, so `git` cannot be shadowed by a writable
        // directory inherited from the build shell. Same value and rationale
        // as `DEFAULT_SECURE_PATH` in `scripts/deploy-live.mjs`.
        env: { ...process.env, PATH: "/usr/bin:/bin" }, // NOSONAR
      },
    );
  } catch {
    return undefined;
  }
}

/**
 * Whether the checkout is shallow, in which case its history is a lie.
 *
 * In a `--depth 1` clone the single grafted commit is a root with no parents, so
 * `git log --name-only -- src/content/posts` reports it as having ADDED all 28
 * post files. Every post would then take the date of the last commit on main
 * and move again on the next deploy — precisely the build-clock churn this
 * module exists to avoid. `actions/checkout` is shallow by default, so the
 * pages the CI validates would not be the pages production serves.
 *
 * The answer is the empty map and a clean fall back to frontmatter, which is
 * what the docblock promises.
 *
 * @returns True when git reports a shallow repository.
 */
function isShallowCheckout(): boolean {
  return git(["rev-parse", "--is-shallow-repository"])?.trim() === "true";
}

/**
 * A date as an ISO timestamp, or undefined when absent or unparseable.
 *
 * Validity is decided with `Number.isNaN(getTime())` rather than by calling
 * `toISOString()` and catching, so one malformed hand-written date skips one
 * post instead of throwing a RangeError through the whole build. Same
 * reasoning as `frontmatterDate` in `sitemap-post-dates.ts`.
 *
 * @param value - A Date or a date-ish string from frontmatter or from git.
 * @returns ISO 8601 timestamp, or undefined.
 */
function isoOf(value: Date | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/**
 * Newest of a set of ISO timestamps, ignoring the undefined ones.
 *
 * @param dates - Candidate timestamps.
 * @returns The latest, or undefined when none is usable.
 */
function newestIso(...dates: (string | undefined)[]): string | undefined {
  return dates
    .filter((d): d is string => Boolean(d))
    .sort((a, b) => a.localeCompare(b))
    .at(-1);
}

/**
 * Collection-id form of a path: no `src/content/posts/` prefix, no extension.
 *
 * Lets callers pass whatever they have — `post.id` ("en/001-foo"), a repo
 * path ("src/content/posts/en/001-foo.mdx") or a locale-relative file name.
 *
 * @param value - Any of the three forms above.
 * @returns The collection id.
 */
function toPostId(value: string): string {
  const relative = value.startsWith(POSTS_PREFIX)
    ? value.slice(POSTS_PREFIX.length)
    : value;
  const withoutExtension = /^(.+)\.[^/.]+$/.exec(relative);
  return withoutExtension ? withoutExtension[1] : relative;
}

/**
 * Whether a commit counts as a revision of the posts it touched.
 *
 * @param sha - Full commit hash.
 * @param subject - Commit subject line.
 * @param marker - Value of the `Content-Bump:` trailer, empty when absent.
 * @returns True when the commit should move the date.
 */
function isSubstantive(sha: string, subject: string, marker: string): boolean {
  const override = marker.trim().toLowerCase();
  if (["skip", "no", "none"].includes(override)) return false;
  if (["force", "yes"].includes(override)) return true;
  if (subject.toLowerCase().includes("[skip-bump]")) return false;
  if (MECHANICAL_COMMITS.has(sha)) return false;

  const conventional = /^\s*([a-z]+)(?:\([^)]*\))?(!)?:/i.exec(subject);
  // No recognizable type: assume real work — see the module docblock.
  if (!conventional) return true;
  // A breaking marker outranks its own type.
  if (conventional[2]) return true;
  return !COSMETIC_TYPES.has(conventional[1].toLowerCase());
}

/**
 * Records the first date seen for each post file named in one `git log` record.
 *
 * Extracted from the parsing loop so that loop stays under the SonarJS
 * cognitive-complexity budget — the same reason `frontmatterDate` was pulled
 * out of `getToolDateMap` in `sitemap-post-dates.ts`.
 *
 * @param names - The `--name-only` block of a record, one path per line.
 * @param iso - Commit timestamp to record for those paths.
 * @param dates - Map being filled, newest-first, so an existing entry wins.
 */
function recordFiles(
  names: string,
  iso: string,
  dates: Map<string, string>,
): void {
  for (const line of names.split("\n")) {
    const file = line.trim();
    if (!file.startsWith(POSTS_PREFIX)) continue;
    const id = toPostId(file);
    if (!dates.has(id)) dates.set(id, iso);
  }
}

/**
 * `post id → ISO timestamp` of the last substantive commit that touched it.
 *
 * ONE `git log` for the whole collection, not one per file: the schema
 * builders run for every page, and per-file invocation would spawn hundreds
 * of git processes for a fact that costs a single pass to compute.
 *
 * @returns The map, empty when git cannot answer.
 */
function readSubstantiveDates(): Map<string, string> {
  const dates = new Map<string, string>();
  if (!REPO_ROOT || isShallowCheckout()) return dates;

  const stdout = git([
    "log",
    "--no-merges",
    `--format=${RECORD_SEP}%H${FIELD_SEP}%cI${FIELD_SEP}%s${FIELD_SEP}%(trailers:key=Content-Bump,valueonly,separator=%x2C)${HEADER_SEP}`,
    "--name-only",
    "--",
    POSTS_PREFIX,
  ]);
  // No git binary, no repository, or a `git log` that failed: the caller falls
  // back to frontmatter rather than inheriting a wrong date.
  if (!stdout) return dates;

  // `git log` is newest-first, so the FIRST substantive commit naming a file
  // is that file's answer; older records for the same file are ignored.
  for (const record of stdout.split(RECORD_SEP)) {
    const cut = record.indexOf(HEADER_SEP);
    if (cut === -1) continue;
    const [sha = "", when = "", subject = "", marker = ""] = record
      .slice(0, cut)
      .split(FIELD_SEP);
    if (!isSubstantive(sha, subject, marker)) continue;
    const iso = isoOf(when);
    if (iso) recordFiles(record.slice(cut + 1), iso, dates);
  }

  return dates;
}

/** Lazily-built singleton behind {@link postSubstantiveCommitDate}. */
let cachedDates: Map<string, string> | undefined;

/**
 * Memoised {@link readSubstantiveDates}: one `git log` per build, not per page.
 *
 * @returns The shared map.
 */
function substantiveDates(): Map<string, string> {
  cachedDates ??= readSubstantiveDates();
  return cachedDates;
}

/**
 * Date of the last substantive commit touching one post.
 *
 * @param id - Collection id, repo path, or locale-relative file name.
 * @returns ISO timestamp, or undefined when git cannot answer for it.
 */
export function postSubstantiveCommitDate(id: string): string | undefined {
  return substantiveDates().get(toPostId(id));
}

/**
 * The post's `dateModified`, from every source that can genuinely change what
 * the page asserts.
 *
 * @param id - Collection id, repo path, or locale-relative file name.
 * @param data - The post's frontmatter dates.
 * @returns ISO timestamp, or undefined when even `publishedDate` is unusable
 *   (the caller then skips the post rather than publishing a made-up date).
 */
export function postDateModified(
  id: string,
  data: PostDateFields,
): string | undefined {
  const published = isoOf(data.publishedDate);
  const commit = postSubstantiveCommitDate(id);
  // Compared by calendar day, not by instant: `publishedDate` is a date-only
  // frontmatter field that Zod coerces to midnight UTC, so the commit that
  // publishes the article is always "later" than it by a few hours. Dropping
  // that commit is what keeps a brand-new post from claiming a revision on the
  // day it appeared.
  const revision =
    published !== undefined &&
    commit !== undefined &&
    commit.slice(0, 10) <= published.slice(0, 10)
      ? undefined
      : commit;

  return newestIso(
    published,
    isoOf(data.updatedDate),
    isoOf(data.lastVerified?.date),
    revision,
  );
}
