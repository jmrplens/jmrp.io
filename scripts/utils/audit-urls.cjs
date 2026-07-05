/**
 * @file Single source of truth for the top-level page paths audited by
 * Lighthouse. Consumed by both `scripts/run-lighthouse-audit.mjs` (via
 * `createRequire`, since it's ESM) and `lighthouserc.cjs` (native `require`,
 * since LHCI's config loader is synchronous CJS). Keeping one canonical list
 * prevents the two consumers from silently drifting apart.
 *
 * The list reflects the top-level sections that actually exist in the
 * current build (verified with `ls dist/`): `/`, `/homelab/`, `/tools/`,
 * `/cv/`, `/publications/`, `/github/`, `/blog/`. `/services/` was checked
 * and does NOT exist as a page in this redesign, so it is intentionally
 * excluded.
 */

/** Canonical page paths audited by Lighthouse (script + lighthouserc). */
const AUDIT_PATHS = [
  "/",
  "/homelab/",
  "/tools/",
  "/cv/",
  "/publications/",
  "/github/",
  "/blog/",
];

module.exports = { AUDIT_PATHS };
