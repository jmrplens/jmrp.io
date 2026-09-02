/**
 * Post-Build Integration
 *
 * This integration consolidates the post-build logic into the Astro lifecycle.
 * It runs after the build is complete (`astro:build:done` hook) and TRANSFORMS
 * the content of the (not-yet-live) `builds/<color>` output directory: HTML/CSS
 * optimization, CSP artifact generation, image optimization, compression, and
 * permission fixups. One step VERIFIES rather than transforms —
 * `verifyMarkdownTwins()` throws when the built pages, their markdown twins
 * and the index files disagree — and it lives here precisely because a throw
 * here happens before `deploy-swap.mjs` retargets `dist/`.
 *
 * It also GENERATES the six Nginx artifacts — `security_headers.conf`,
 * `security_headers_assets.conf` and the four http-level maps under `maps/` —
 * but into NEITHER the served tree NOR the git working tree. They are written
 * to a staging directory (`/var/lib/jmrp.io/nginx-staged/` by default,
 * overridable with
 * `POSTBUILD_NGINX_STAGING_DIR`) that sits outside both `distDir` and the
 * repository, so
 * `fixPermissions()`'s `chown -R www-data` cannot reach them and no URL can
 * serve them. `manifest.json` is written LAST and is the delivery contract:
 * `deploy-live.mjs` reads it and MOVES exactly those files into
 * `/etc/nginx/snippets/jmrp/`, so a half-finished build (no manifest) delivers
 * nothing and a stray temp file is never delivered.
 *
 * Every generated artifact carries one `# Build-Stamp:` line, identical across
 * the six files and unique to this build. It is what makes
 * `nginx -T | grep -c "Build-Stamp: <id>"` = 6 a proof that the RUNNING config
 * came from a build rather than from a hand-seeded copy — `nginx -T` dumps
 * comments verbatim and dumps each distinct file exactly once, however many
 * times it is included.
 *
 * PUBLISH actions (moving those artifacts to system Nginx + test + reload +
 * rollback, Cloudflare cache purge, IndexNow/Bing Webmaster submission)
 * intentionally do NOT live here — they run from `scripts/deploy-live.mjs`
 * AFTER `deploy-swap.mjs` has atomically retargeted `dist/` to this directory.
 * Running them here (pre-swap) would deploy new headers/CDN state while
 * `dist/` still pointed at the previous build.
 */

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AstroIntegration, AstroIntegrationLogger } from "astro";

import {
  FALLBACK_STAGING_DIR,
  stagingCandidates,
} from "../../scripts/nginx-staging.mjs";
import { generateBlogRedirects } from "./post-build/blog-redirects.js";
import { compressAssets } from "./post-build/compression.js";
import { finalizeCspConfig } from "./post-build/csp.js";
import { extractCssDataUris } from "./post-build/css.js";
import { generateDocsRedirects } from "./post-build/docs-redirects.js";
import { processHtmlFiles } from "./post-build/html.js";
import { optimizeImages } from "./post-build/images.js";
import { generateMdTwinAlternates } from "./post-build/md-twin-alternates.js";
import { generateTagRedirects } from "./post-build/tag-redirects.js";
import type { CspData } from "./post-build/types.js";
import { BUILD_STAMP_PREFIX, writeNginxSnippet } from "./post-build/utils.js";
import { timed } from "./timing.js";

/**
 * Default secure PATH for executing system commands.
 * Prioritizes standard system directories to mitigate PATH injection risks.
 */
const DEFAULT_SECURE_PATH =
  "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

/**
 * The six Nginx artifacts this build delivers, as paths relative to the
 * staging directory — and, one-for-one, to `/etc/nginx/snippets/jmrp/`.
 *
 * This list IS the delivery contract. It is written verbatim into
 * `manifest.json`, and `deploy-live.mjs` moves exactly these files and prunes
 * any `maps/*.conf` at the destination that is not named here: with the four
 * maps behind a single wildcard `include`, an orphan left by a generator that
 * no longer exists would otherwise stay live forever.
 *
 * Order is irrelevant to Nginx (each file is a self-contained `map` or
 * `add_header` block) but kept stable so manifests diff cleanly.
 */
const NGINX_ARTIFACTS = [
  "security_headers.conf",
  "security_headers_assets.conf",
  "maps/blog_redirects.conf",
  "maps/docs_redirects.conf",
  "maps/tag_redirects.conf",
  "maps/md_twin_alternates.conf",
] as const;

/**
 * Creates the jmrp-post-build Astro integration.
 *
 * This integration performs several critical optimizations and security hardening
 * tasks after the site has been built:
 * - HTML transformation (SRI, Nonces, style-to-class conversion).
 * - CSS optimization (Data URI extraction).
 * - CSP and security headers generation.
 * - Permission fixup for the built directory (if system Nginx deployment is configured).
 *
 * @returns {AstroIntegration} The configured Astro integration.
 */
export default function postBuildIntegration(): AstroIntegration {
  return {
    name: "jmrp-post-build",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const distDir = fileURLToPath(dir);
        const relativeDist = path.relative(process.cwd(), distDir);
        logger.info(`Starting optimizations in [${relativeDist}]`);

        const cspData: CspData = {
          imageDomains: new Set<string>(),
        };

        // ONE stamp per build, computed here and handed to every generator, so
        // the six artifacts are provably one set. `stampId` is the bare value
        // (it goes into the manifest); `stamp` is the ready-to-prepend banner
        // line each generator emits, built from the prefix the generators
        // validate against, so the two halves cannot drift apart.
        const stampId = createBuildStampId();
        const stamp = `${BUILD_STAMP_PREFIX}${stampId}\n`;

        // Resolved ONCE, here, and passed down — the generators never look the
        // location up for themselves, so there is exactly one place that
        // decides where a build's Nginx artifacts land.
        const stagingDir = resolveNginxStagingDir();

        try {
          assertStagingDirIsSafe(stagingDir, distDir);

          // Before the first generator writes. Clearing (rather than
          // overwriting in place) is what stops an artifact from a previous
          // build — or from a generator that no longer exists — surviving as
          // an orphan that the manifest would not mention but a stale copy at
          // the destination would keep alive.
          // The prepared directory, which may differ from the configured one
          // when this build cannot write there (CI, a contributor's laptop).
          const stagedIn = await timed("prepareNginxStaging", logger, () =>
            prepareNginxStaging(stagingDir, logger),
          );

          await timed("extractCssDataUris", logger, () =>
            extractCssDataUris(distDir, logger),
          );

          const systemNginxDir = process.env.POSTBUILD_NGINX_SNIPPETS_DIR || "";

          // We always enable CSP artifact generation (nonces, hashes, .conf file)
          // during the build phase so tests can verify them, regardless of
          // whether we deploy them to a system Nginx later.
          const enableCsp = true;

          await timed("processHtmlFiles", logger, () =>
            processHtmlFiles(distDir, cspData, enableCsp, logger),
          );
          await timed("finalizeCspConfig", logger, () =>
            finalizeCspConfig(stagedIn, cspData, stamp, logger),
          );
          // Second Nginx artifact: the prefix-less blog redirect map. Derived
          // from the built directory names, so posts added later are covered
          // without touching the vhost. `distDir` is the INPUT it reads;
          // `stagedIn` is where the snippet goes.
          await timed("generateBlogRedirects", logger, () =>
            generateBlogRedirects(distDir, stagedIn, stamp, logger),
          );
          await timed("generateDocsRedirects", logger, () =>
            generateDocsRedirects(stagedIn, stamp, logger),
          );
          await timed("generateTagRedirects", logger, () =>
            generateTagRedirects(stagedIn, stamp, logger),
          );
          // Verification, not a transform: the built pages, their markdown
          // twins and the three index surfaces must agree. Runs BEFORE the
          // image/compression phase so a drift fails in ~0.2s instead of after
          // ~30s of work, and — being inside astro:build:done — it fails the
          // build before deploy-swap.mjs retargets the `dist` symlink, so a
          // drifted build can never become the live one. See GEO audit #6,
          // findings A2 / M5 / M8 (and A3, via the twin date rule).
          //
          // It also runs before generateMdTwinAlternates, and that order is
          // load-bearing — less so than when the generators wrote straight
          // into the working tree's nginx/ snippets (a failed build left the
          // announcement map rewritten and waiting for the next unrelated
          // `nginx -s reload` to publish it), but still worth keeping: this is
          // the one artifact derived from exactly what the guard validates,
          // and a build that stops here writes no manifest, so nothing it
          // staged can ever be delivered. Nothing is lost by checking first:
          // guard and generator both only read distDir, so neither observes
          // the other's effects, and a passing build still runs both.
          await timed("verifyMarkdownTwins", logger, () =>
            verifyMarkdownTwins(distDir),
          );

          // Fourth Nginx artifact: the markdown-twin alternate map. Derived
          // from the twins the build actually wrote, so a page never announces
          // a twin that does not exist, and removing one withdraws the
          // announcement in the same build (GEO audit 2026-09-02, A2).
          await timed("generateMdTwinAlternates", logger, () =>
            generateMdTwinAlternates(distDir, stagedIn, stamp, logger),
          );

          // LAST of the Nginx steps, on purpose: the manifest is what makes
          // the staged set deliverable, so it must not exist until all six
          // artifacts do.
          await timed("writeNginxManifest", logger, () =>
            writeNginxManifest(stagedIn, stampId, logger),
          );

          // optimizeImages (re-compresses PNGs) and compressAssets (gzip/brotli
          // over js/css/svg/json/xml/txt) touch disjoint file sets — PNG is not
          // in compressAssets' extension list — so they can run concurrently
          // instead of back-to-back.
          await Promise.all([
            timed("optimizeImages", logger, () =>
              optimizeImages(distDir, logger),
            ),
            timed("compressAssets", logger, () =>
              compressAssets(distDir, logger),
            ),
          ]);

          if (systemNginxDir) {
            // Only fix permissions when deploying to Nginx (requires sudo and www-data user).
            // The actual move-to-Nginx + reload happens post-swap in scripts/deploy-live.mjs.
            // It reaches distDir only — stagedIn sits outside it, so the
            // staged snippets keep root ownership and arrive at /etc/nginx
            // owned by root (rename(2) carries the source inode's owner).
            await timed("fixPermissions", logger, () =>
              fixPermissions(distDir, logger),
            );
          } else {
            logger.info(
              "Skipping permission fix (POSTBUILD_NGINX_SNIPPETS_DIR not set).",
            );
          }
        } catch (error) {
          logger.error("Fatal optimization error:");
          logger.error(
            error instanceof Error
              ? error.stack || error.message
              : String(error),
          );
          throw error instanceof Error ? error : new Error(String(error));
        }

        logger.info(`Optimizations completed successfully.`);
      },
    },
  };
}

/**
 * Builds the identifier every generated Nginx artifact of this build carries.
 *
 * Two properties matter. It must be UNIQUE per build — a timestamp alone is
 * not enough, since two builds inside the same second would collide and a
 * stale file would masquerade as fresh — hence the random suffix. And it must
 * contain no regular-expression metacharacter, because the documented
 * verification greps it back out of `nginx -T`
 * (`ID=$(sed -n 's/^# Build-Stamp: //p' …); nginx -T | grep -c "Build-Stamp: $ID"`)
 * as an unescaped pattern; `-` is literal outside a bracket expression, so the
 * compact form below is safe there.
 *
 * @returns A stamp such as `20260902T143355Z-1a2b3c4d`.
 */
function createBuildStampId(): string {
  const compact = new Date().toISOString().slice(0, 19).replaceAll(/[-:]/g, "");
  return `${compact}Z-${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * Resolves the directory this build stages its Nginx artifacts in.
 *
 * Deliberately NOT under the repository and NOT under `distDir`. A generated
 * Nginx snippet should exist in exactly two places over its life: here, for the
 * moments between the build writing it and `deploy-live.mjs` moving it, and
 * then `/etc/nginx/snippets/jmrp/`. Keeping it out of the repo means a
 * `git checkout` can never change live configuration, and keeping it out of
 * `dist/` means no rule in the vhost is the only thing standing between a
 * config file and the public — which is what it used to be.
 *
 * `/var/lib` shares a filesystem with `/etc/nginx` (both device 66306 on this
 * host), and that is what makes the delivery a real `rename(2)` move instead of
 * a copy. `/tmp` and `/run` are separate in-memory filesystems here and would
 * silently degrade the move to copy+unlink, so an override pointing at either
 * is fine for a review build but must never be used for a real deploy.
 *
 * @returns Absolute path of the staging directory.
 */
function resolveNginxStagingDir(): string {
  const override = (process.env.POSTBUILD_NGINX_STAGING_DIR || "").trim();
  return path.resolve(override || stagingCandidates()[0]);
}

/**
 * Refuses a staging directory that must not be emptied on every build.
 *
 * `prepareNginxStaging()` removes this directory recursively, and its path can
 * come from an environment variable, so the destructive step gets an explicit
 * precondition rather than trusting whatever was exported. Rejected: the
 * filesystem root, the project root or any ancestor of it, any ancestor of the
 * build output — and, in the other direction, anything INSIDE `distDir`, which
 * would both serve the snippets over HTTP and hand them to `fixPermissions()`'s
 * `chown -R www-data` (a mode/owner `rename(2)` would then carry into
 * `/etc/nginx`).
 *
 * Rejected separately, because it is the one plausible wrong value with
 * catastrophic reach: the delivery DESTINATION, or any directory containing
 * it. `POSTBUILD_NGINX_STAGING_DIR=/etc/nginx/snippets/jmrp` — or `/etc/nginx`
 * — would make the clear an `rm -rf` over the live configuration, and
 * `security_headers*.conf` are named by exact `include`s, so the next
 * `systemctl restart` would refuse to start every vhost on the box. Nothing
 * legitimate stages into its own destination anyway: delivery is a move, and
 * `mv src src` fails.
 *
 * @param stagedIn - Absolute path resolved by `resolveNginxStagingDir()`.
 * @param distDir - The directory Astro just built into.
 * @throws If the path is unsafe to empty, sits inside the build output, or
 *   overlaps the directory `deploy-live.mjs` delivers to.
 */
function assertStagingDirIsSafe(stagedIn: string, distDir: string): void {
  const contains = (parent: string, child: string): boolean => {
    const rel = path.relative(parent, child);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  };

  const snippetsDir = (process.env.POSTBUILD_NGINX_SNIPPETS_DIR || "").trim();
  if (snippetsDir) {
    const destination = path.resolve(snippetsDir);
    if (contains(stagedIn, destination) || contains(destination, stagedIn)) {
      throw new Error(
        `Refusing to stage Nginx artifacts in [${stagedIn}]: it overlaps the` +
          ` delivery destination [${destination}], which this build would then` +
          " empty before regenerating anything. Staging is a scratch directory," +
          " not the place Nginx reads from. Check POSTBUILD_NGINX_STAGING_DIR.",
      );
    }
  }

  if (
    stagedIn === path.parse(stagedIn).root ||
    contains(stagedIn, process.cwd()) ||
    contains(stagedIn, distDir) ||
    contains(distDir, stagedIn)
  ) {
    throw new Error(
      `Refusing to stage Nginx artifacts in [${stagedIn}]: this directory is` +
        " emptied on every build, so it must be a dedicated directory that is" +
        " neither an ancestor of the project root or of the build output, nor" +
        " inside the build output. Check POSTBUILD_NGINX_STAGING_DIR.",
    );
  }
}

/**
 * Empties the staging directory and recreates it with its `maps/` subdirectory.
 *
 * Runs before the first generator writes. Clearing is not housekeeping: the
 * manifest names what to deliver, but the destination is read through a
 * wildcard `include`, so an artifact left behind by a removed generator would
 * be delivered on some later build and then stay live with nothing regenerating
 * it. Emptying here means the staged set is always exactly what this build
 * produced.
 *
 * @param stagedIn - Absolute path of the staging directory.
 * @param logger - Astro logger instance.
 */
async function prepareNginxStaging(
  stagedIn: string,
  logger: AstroIntegrationLogger,
): Promise<string> {
  try {
    await fs.promises.rm(stagedIn, { recursive: true, force: true });
    await fs.promises.mkdir(path.join(stagedIn, "maps"), {
      recursive: true,
      mode: 0o755,
    });
    logger.info(
      `Nginx staging ready: [${path.relative(process.cwd(), stagedIn) || stagedIn}]`,
    );
    return stagedIn;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EACCES" && code !== "EPERM" && code !== "EROFS") throw error;
    // The staging root is deployment configuration, not a universal constant:
    // on this host it is /var/lib/jmrp.io/nginx-staged, which only root can
    // create. A CI runner and a contributor's laptop cannot, and neither of
    // them delivers anything — deploy-live.mjs refuses to run outside the
    // production root. So fall back to a writable directory that is still
    // outside the repository and outside the served tree, and say so loudly:
    // a build that stages here CANNOT deliver, and a silent fallback would let
    // a misconfigured production build look successful while delivering
    // nothing, which is the exact failure this migration existed to remove.
    const fallback = FALLBACK_STAGING_DIR;
    logger.warn(
      `Cannot write Nginx staging at [${stagedIn}] (${code}). Falling back ` +
        `to [${fallback}] — this build stages but CANNOT deliver. Set ` +
        `POSTBUILD_NGINX_STAGING_DIR to a writable path to silence this.`,
    );
    await fs.promises.rm(fallback, { recursive: true, force: true });
    await fs.promises.mkdir(path.join(fallback, "maps"), {
      recursive: true,
      mode: 0o755,
    });
    return fallback;
  }
}

/**
 * Writes `manifest.json`, the contract `deploy-live.mjs` delivers against.
 *
 * Every artifact is checked for existence and non-emptiness first, and a
 * missing one fails the build. That check is load-bearing rather than
 * defensive: `deploy-live.mjs` prunes any `maps/*.conf` at the destination
 * that the manifest does not name, so a generator that silently produced
 * nothing would not merely fail to update its map — it would DELETE the live
 * one. Failing here keeps the previous, working config in place.
 *
 * Written last and atomically (temp file + `rename(2)`, via
 * `writeNginxSnippet`), so a build that dies partway leaves no manifest at all
 * and therefore delivers nothing.
 *
 * @param stagedIn - Absolute path of the staging directory.
 * @param stampId - The bare build stamp shared by all six artifacts.
 * @param logger - Astro logger instance.
 * @throws If any of the six artifacts is missing or empty.
 */
async function writeNginxManifest(
  stagedIn: string,
  stampId: string,
  logger: AstroIntegrationLogger,
) {
  const staged = await Promise.all(
    NGINX_ARTIFACTS.map(async (relPath) => {
      const absPath = path.join(stagedIn, relPath);
      const stats = await fs.promises.stat(absPath).catch(() => null);
      return { relPath, size: stats?.isFile() ? stats.size : 0 };
    }),
  );

  const missing = staged
    .filter((entry) => entry.size === 0)
    .map((entry) => entry.relPath);
  if (missing.length > 0) {
    throw new Error(
      `Nginx staging is incomplete — missing or empty: ${missing.join(", ")}.` +
        " Refusing to write manifest.json: deploy-live.mjs prunes maps/*.conf" +
        " it does not name, so delivering a partial set would remove live" +
        " configuration instead of updating it.",
    );
  }

  await writeNginxSnippet(
    path.join(stagedIn, "manifest.json"),
    `${JSON.stringify(
      {
        // Key names are `deploy-live.mjs`'s canonical contract. It also
        // accepts `buildStamp`/`artifacts` as legacy aliases, precisely so a
        // generator that drifts is visible — emitting an alias from the only
        // generator there is would ship that drift instead of catching it.
        stamp: stampId,
        generatedAt: new Date().toISOString(),
        files: [...NGINX_ARTIFACTS],
      },
      null,
      2,
    )}\n`,
  );
  logger.info(
    `✓ Staged ${NGINX_ARTIFACTS.length} Nginx artifacts (Build-Stamp: ${stampId}).`,
  );
}

/**
 * Creates secure spawn options with a sanitized PATH, to mitigate PATH
 * injection risks when invoking system commands (sudo chown/find).
 */
function createSecureSpawnOptions() {
  return {
    stdio: "inherit" as const,
    env: {
      ...process.env,
      PATH: DEFAULT_SECURE_PATH,
    },
  };
}

/**
 * Fixes permissions for the distribution directory to ensure Nginx (www-data) can read it.
 *
 * @param distDir - The distribution directory path.
 * @param logger - Astro logger instance.
 */
function fixPermissions(distDir: string, logger: AstroIntegrationLogger) {
  logger.info(`Fixing permissions for [${distDir}]...`);
  const secureOpts = createSecureSpawnOptions();
  try {
    // Set ownership to www-data:www-data
    const chownResult = spawnSync(
      "sudo",
      ["chown", "-R", "www-data:www-data", distDir],
      secureOpts,
    );
    if (chownResult.error || chownResult.status !== 0) {
      const errorMsg =
        chownResult.error?.message || `exit code ${chownResult.status}`;
      throw new Error(`chown failed: ${errorMsg}`);
    }

    // Set directory permissions to 755
    const chmodDirResult = spawnSync(
      "sudo",
      ["find", distDir, "-type", "d", "-exec", "chmod", "755", "{}", "+"],
      secureOpts,
    );
    if (chmodDirResult.error || chmodDirResult.status !== 0) {
      const errorMsg =
        chmodDirResult.error?.message || `exit code ${chmodDirResult.status}`;
      throw new Error(`chmod directories failed: ${errorMsg}`);
    }

    // Set file permissions to 644
    const chmodFileResult = spawnSync(
      "sudo",
      ["find", distDir, "-type", "f", "-exec", "chmod", "644", "{}", "+"],
      secureOpts,
    );
    if (chmodFileResult.error || chmodFileResult.status !== 0) {
      const errorMsg =
        chmodFileResult.error?.message || `exit code ${chmodFileResult.status}`;
      throw new Error(`chmod files failed: ${errorMsg}`);
    }

    logger.info("✓ Permissions fixed (www-data:www-data, 755/644).");
  } catch (error) {
    // Permission failures should fail the build, not just warn
    logger.error("Failed to fix permissions.");
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Fails the build when the markdown-twin, announcement and index surfaces
 * disagree.
 *
 * The rules live in `scripts/ci/check-markdown-twins.mjs` rather than here so
 * there is exactly ONE implementation: the same file is runnable by hand
 * against any build directory (`node scripts/ci/check-markdown-twins.mjs
 * builds/green`) and unit-tested on its own (`pnpm test:unit`). A guard whose
 * failure mode nobody can reproduce is the vacuous check this one replaces.
 *
 * `process.execPath` rather than "node": no PATH lookup, and the child runs on
 * the same runtime as the build. `stdio: "inherit"` so the offending PATHS land
 * in the build log, not a count. Exit 1 means drift; any other non-zero status
 * means the guard itself could not run, and saying "drift" there would be a lie
 * about what happened. A child killed by a signal has a null status, so the
 * signal is reported instead — "exit null" names no cause.
 *
 * @param distDir - The directory Astro just built into.
 */
function verifyMarkdownTwins(distDir: string) {
  const script = path.join(
    process.cwd(),
    "scripts/ci/check-markdown-twins.mjs",
  );
  const result = spawnSync(process.execPath, [script, distDir], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status === 1) {
    throw new Error(
      "markdown twin / announcement / index drift — see the paths listed above",
    );
  }
  if (result.status !== 0) {
    // `status` is null exactly when a signal killed the child (OOM killer,
    // a timeout, an interrupted build). Printing "exit null" there discards
    // the only fact that explains the failure.
    const cause = result.signal
      ? `signal ${result.signal}`
      : `exit ${result.status}`;
    throw new Error(
      `check-markdown-twins could not run (${cause}) — this is a` +
        " guard failure, not a drift report",
    );
  }
}
