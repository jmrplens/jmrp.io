/**
 * The one place that knows where a build stages its Nginx artifacts.
 *
 * Three consumers have to agree on this and used to hold their own copy of the
 * answer: the post-build hook that writes the files, `deploy-live.mjs` that
 * moves them, and `tests/security.spec.ts` that reads the generated CSP. When
 * the default moved out of the repository, two of the three were updated and
 * the third kept looking at the old path — the suite went red in CI and green
 * locally, because a developer's `.env` happened to point at the delivered
 * copy instead. Three sources of truth for one path is the same defect class
 * this module's callers exist to prevent, so there is now one.
 *
 * @module
 */

import os from "node:os";
import path from "node:path";

/**
 * Staging root on the production host. Only root can create it, which is
 * deliberate: it is outside the repository, so a `git checkout` can never
 * change live configuration, and outside the served tree, so no rule in the
 * vhost is the only thing standing between a config file and the public.
 */
export const PRODUCTION_STAGING_DIR = "/var/lib/jmrp.io/nginx-staged";

/**
 * Where a build falls back when it cannot write the production staging root —
 * a CI runner, a contributor's laptop. Neither delivers anything, so the
 * `rename(2)` atomicity that `/var/lib` buys is not needed there.
 */
export const FALLBACK_STAGING_DIR = path.join(os.tmpdir(), "jmrp-nginx-staged");

/**
 * Every directory a staged artifact may currently be in, most recent first.
 *
 * An explicit `POSTBUILD_NGINX_STAGING_DIR` wins outright. `|| ""` then a trim
 * rather than `??`: an exported empty value is this repo's documented way to
 * opt a worktree out of an action, and must read as "unset" here too.
 *
 * @returns {string[]} Absolute paths, without checking whether they exist.
 */
export function stagingCandidates() {
  const configured = (process.env.POSTBUILD_NGINX_STAGING_DIR || "").trim();
  if (configured) return [path.resolve(configured)];
  return [PRODUCTION_STAGING_DIR, FALLBACK_STAGING_DIR];
}
