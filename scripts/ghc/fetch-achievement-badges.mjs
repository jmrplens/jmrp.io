/**
 * Self-hosts the official GitHub achievement badge artwork the
 * /projects/contributions/ shelf (`AchievementShelf.astro`) draws.
 *
 * Where the URLs come from: ghchronicle's achievements collector
 * (`/opt/ghchronicle`, `internal/collect/achievements.go`) scrapes the
 * profile's `?tab=achievements` page and stores each earned badge's `<img>`
 * source in the `image` field of `gh_achievement` and
 * `gh_achievement_progress`, e.g.
 * `https://github.githubassets.com/assets/pull-shark-gold-90985540b385.png`.
 * Each tier is a separate image (the color is in the file name: `default`,
 * `bronze`, `silver`, `gold`); the `x2`/`x3`/`x4` pill is HTML that GitHub
 * draws on top, so the shelf draws it too.
 *
 * Why download instead of linking to GitHub: the site's CSP is nonce-only with a
 * restricted `img-src`, and a hotlink would hand GitHub a referrer for every
 * visitor. Each badge is saved once under a STABLE key,
 * `src/assets/achievements/<slug>-<tier>.png` (the content hash in GitHub's
 * file name is dropped, so an asset re-deploy on their side changes
 * nothing here), downscaled to 168x168 (3x the 56 px it renders at) and
 * palette-quantized so the committed files stay around 10-15 KB each;
 * Astro's image pipeline then emits AVIF/WebP from them.
 *
 * Fixture-first, like the dataset itself: a badge already on disk is never
 * re-downloaded (pass `force` to refresh), and a failed download only warns
 * and keeps whatever is committed. The shelf falls back to a plain disc for
 * a tier with no file yet, so a newly earned tier on a host with no route
 * to GitHub degrades, it does not break the build.
 *
 * Licensing: the badge artwork is GitHub, Inc.'s, shown here only to
 * depict achievements GitHub awarded to this account, the same way the
 * profile page shows them. It is not covered by this site's content
 * license.
 *
 * @module
 */

import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

/** Where the badges live, relative to the repository root. */
export const BADGES_DIR = "src/assets/achievements";

/** Side, in pixels, of the stored badge (3x the rendered 56 px). */
export const BADGE_SIZE = 168;

/** Largest response accepted, in bytes (GitHub's originals are ~110 KB,
 * GitLab's achievement avatars ~35 KB). */
const MAX_BYTES = 1024 * 1024;

/** Per-request timeout. */
const TIMEOUT_MS = 15_000;

/** Tier names GitHub encodes in the badge file name. */
const TIERS = new Set(["default", "bronze", "silver", "gold"]);

/**
 * Only GitHub's own static host, one PNG per slug and tier, is ever
 * fetched: the URL comes from a database row, so it is held to the exact
 * shape ghchronicle's parser accepts before anything is requested.
 */
const BADGE_URL_RE =
  /^https:\/\/github\.githubassets\.com\/assets\/([a-z0-9-]+)-(default|bronze|silver|gold)-[0-9a-f]+\.png$/;

const PNG_MAGIC = Buffer.from("89504e470d0a1a0a", "hex");

/**
 * The stable file name for one achievement at one tier.
 *
 * @param {string} slug - Achievement slug, e.g. `"pull-shark"`.
 * @param {string} tierName - `"default" | "bronze" | "silver" | "gold"`.
 * @returns {string} E.g. `"pull-shark-gold.png"`.
 */
export function badgeFileName(slug, tierName) {
  return `${slug}-${tierName}.png`;
}

/**
 * Checks that `url` is a GitHub badge image for exactly this slug and tier.
 *
 * @param {string} url - Candidate URL from the database.
 * @param {string} slug - Expected achievement slug.
 * @param {string} tierName - Expected tier name.
 * @returns {boolean} Whether the URL may be fetched.
 */
export function isBadgeUrl(url, slug, tierName) {
  const match = BADGE_URL_RE.exec(url);
  return match?.[1] === slug && match?.[2] === tierName;
}

/**
 * Downloads one badge and returns the resized, quantized PNG.
 *
 * @param {string} url - Validated badge URL.
 * @param {typeof fetch} fetchImpl - `fetch`, injectable for tests.
 * @returns {Promise<Buffer>} The PNG to store.
 */
async function downloadBadge(url, fetchImpl) {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "error",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length === 0 || body.length > MAX_BYTES) {
    throw new Error(`unexpected size ${body.length} B`);
  }
  if (!body.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new Error("response is not a PNG");
  }
  return sharp(body)
    .resize(BADGE_SIZE, BADGE_SIZE, { fit: "contain" })
    .png({ palette: true, quality: 90, compressionLevel: 9, effort: 10 })
    .toBuffer();
}

/**
 * GitLab achievement avatars: only GitLab.com's own uploads path, one PNG.
 * The URL comes from the GraphQL API, so it is held to this exact shape
 * before anything is requested.
 */
const GITLAB_BADGE_URL_RE =
  /^https:\/\/gitlab\.com\/uploads\/-\/system\/achievements\/achievement\/avatar\/\d+\/[\w.-]+\.png(\?v=\d+)?$/;

/**
 * Checks that `url` is a GitLab.com achievement avatar.
 *
 * @param {string} url - Candidate URL from the API.
 * @returns {boolean} Whether the URL may be fetched.
 */
export function isGitlabBadgeUrl(url) {
  return GITLAB_BADGE_URL_RE.test(url);
}

/**
 * Downloads each planned badge that is not on disk yet. Never throws.
 *
 * @param {readonly {file: string, url: string, valid: boolean}[]} plan - What to fetch.
 * @param {object} options - See {@link ensureAchievementBadges}.
 * @param {string} options.root - Repository root.
 * @param {boolean} options.force - Re-download badges already on disk.
 * @param {typeof fetch} options.fetchImpl - Injectable `fetch`.
 * @param {(line: string) => void} options.log - Progress sink.
 * @param {(line: string) => void} options.warn - Warning sink.
 * @returns {Promise<{fetched: string[], kept: string[], failed: string[]}>}
 *   File names by outcome.
 */
async function ensureBadgeFiles(plan, { root, force, fetchImpl, log, warn }) {
  const dir = path.join(root, BADGES_DIR);
  const outcome = { fetched: [], kept: [], failed: [] };
  for (const { file, url, valid } of plan) {
    const target = path.join(dir, file);
    if (!force && fs.existsSync(target)) {
      outcome.kept.push(file);
      continue;
    }
    if (!valid) {
      warn(`  Achievement badge ${file}: no usable image URL, skipped.`);
      outcome.failed.push(file);
      continue;
    }
    try {
      const png = await downloadBadge(url, fetchImpl);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${target}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, png);
      fs.renameSync(tmp, target);
      outcome.fetched.push(file);
      log(`  ✓ Achievement badge ${file} (${png.length} B)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warn(
        `  Achievement badge ${file}: download failed (${message}); keeping what is committed.`,
      );
      outcome.failed.push(file);
    }
  }
  return outcome;
}

/**
 * Makes sure every given achievement has its badge on disk. Never throws.
 *
 * @param {readonly {achievement: string, tierName: string, image?: string | null}[]} rows
 *   - Achievement rows carrying ghchronicle's `image` URL.
 * @param {object} [options] - Options.
 * @param {string} [options.root] - Repository root; defaults to `process.cwd()`.
 * @param {boolean} [options.force] - Re-download badges already on disk.
 * @param {typeof fetch} [options.fetchImpl] - Injectable `fetch`.
 * @param {(line: string) => void} [options.log] - Progress sink.
 * @param {(line: string) => void} [options.warn] - Warning sink.
 * @returns {Promise<{fetched: string[], kept: string[], failed: string[]}>}
 *   File names by outcome.
 */
export async function ensureAchievementBadges(
  rows,
  {
    root = process.cwd(),
    force = false,
    fetchImpl = fetch,
    log = () => {},
    warn = console.warn,
  } = {},
) {
  const plan = rows
    .filter((row) => TIERS.has(row.tierName))
    .map((row) => ({
      file: badgeFileName(row.achievement, row.tierName),
      url: row.image ?? "",
      valid: isBadgeUrl(row.image ?? "", row.achievement, row.tierName),
    }));
  return ensureBadgeFiles(plan, { root, force, fetchImpl, log, warn });
}

/**
 * Same as {@link ensureAchievementBadges} for GitLab achievements, which have
 * no tiers: each is saved as `src/assets/achievements/<slug>.png`, where the
 * slug already starts with `gitlab-` (`normalizeAchievement` in
 * `scripts/gl/normalize.mjs`). The artwork is GitLab Inc.'s, shown only to
 * depict an achievement GitLab awarded this account.
 *
 * @param {readonly {achievement: string, image?: string | null}[]} rows - GitLab rows.
 * @param {Parameters<typeof ensureAchievementBadges>[1]} [options] - Options.
 * @returns {Promise<{fetched: string[], kept: string[], failed: string[]}>}
 *   File names by outcome.
 */
export async function ensureGitlabAchievementBadges(
  rows,
  {
    root = process.cwd(),
    force = false,
    fetchImpl = fetch,
    log = () => {},
    warn = console.warn,
  } = {},
) {
  const plan = rows
    .filter((row) => /^gitlab-[a-z0-9-]+$/.test(row.achievement))
    .map((row) => ({
      file: `${row.achievement}.png`,
      url: row.image ?? "",
      valid: isGitlabBadgeUrl(row.image ?? ""),
    }));
  return ensureBadgeFiles(plan, { root, force, fetchImpl, log, warn });
}

// Standalone: `node scripts/ghc/fetch-achievement-badges.mjs [--force]`
// asks InfluxDB for the badges currently shown and fetches any missing file.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { resolveInfluxConfig } = await import("./influx.mjs");
  const { getAchievements } = await import("./queries.mjs");
  const { SHOWN_ACHIEVEMENTS } = await import("./roster.mjs");
  const rows = (await getAchievements(resolveInfluxConfig())).filter((row) =>
    SHOWN_ACHIEVEMENTS.has(row.achievement),
  );
  const { failed } = await ensureAchievementBadges(rows, {
    force: process.argv.includes("--force"),
    log: (line) => console.log(line),
    warn: (line) => console.warn(line),
  });
  process.exit(failed.length > 0 ? 1 : 0);
}
