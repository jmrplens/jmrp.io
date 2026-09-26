/**
 * SSR metric tokens for /projects — the contract between this repo and
 * nginx, mirroring `src/components/homelab/ssr-tokens.ts` one prefix over.
 *
 * ── How this works (no client-side JavaScript) ──────────────────────────
 *
 * The "Contributions to other projects" block and the per-card live meta
 * (stars, latest release) render these placeholder strings into the static
 * HTML at build time. At serve time, nginx replaces every `PRJ_*` token with
 * a fresh, locale-formatted value before the response leaves the server, the
 * same `body_filter_by_lua` pattern `homelab_ssr_metrics.lua` already runs
 * for `/homelab/` — see `plan/projects-ghchronicle/PLAN.md` section 7 for
 * the nginx side (`/etc/nginx/lua/projects_ssr_metrics.lua`, a LATER task;
 * this registry is the repo-side half of that contract). The FORMATTING
 * spec both that Lua module and `astro dev`'s `vite-plugin-dev-prj-tokens.ts`
 * must follow lives in `scripts/ghc/format.mjs` — read that module's doc
 * comment before adding a token that needs a kind other than a plain count.
 *
 * Unlike `/homelab/`, which has nginx query InfluxDB directly, nginx reads a
 * small JSON summary written by `scripts/ghc/write-summary.mjs` — see that
 * module's doc comment and `plan/projects-ghchronicle/json-vs-influx.md` for
 * why: every /projects figure needs repo-specific logic (deduplication,
 * privacy filtering, YAML-driven classification/folding) that belongs in
 * Node, tested, shared with the build — not duplicated into Lua.
 *
 * Any token nginx does not recognize is replaced with an em dash ("—"), so
 * an out-of-sync registry degrades to a "no data" state, never to a leaked
 * placeholder string reaching a reader.
 *
 * ── Adding, renaming or removing a metric ───────────────────────────────
 *
 * 1. Add/rename/remove the token HERE (keep the `PRJ_` prefix — the
 *    substitution pattern is `PRJ_[A-Z0-9_]+`).
 * 2. Add/rename/remove the matching key in `write-summary.mjs`'s
 *    `buildSummaryTokens()`, which is what actually produces the value nginx
 *    reads — this file only DECLARES the token name.
 * 3. Mirror the change in the `METRICS` table of the (future)
 *    `/etc/nginx/lua/projects_ssr_metrics.lua`, then `nginx -s reload`.
 * 4. Render the token from the component.
 * 5. Rebuild. In `astro preview` (no nginx) the raw token is visible on the
 *    page — expected; only nginx performs the substitution.
 *
 * Values are PRE-FORMATTED by Lua per locale (thousands separators, dates),
 * so components must render them verbatim and never re-format them — same
 * rule as `HLM_*`.
 *
 * @module
 */

import { ACTIVE_REPOS, projectTokenId } from "../../../scripts/ghc/roster.mjs";

/**
 * One project card's live SSR figures. `stars30dClass`/`relClass` carry a
 * CSS class (`"prj-hide"` or `""`) because nginx, not the SSR component,
 * decides whether a figure is missing (0 stars gained in 30 days, no stable
 * release yet) — the same pattern `NodeSsr.statusClass` uses in
 * `homelab/ssr-tokens.ts` for a branch the build-time component cannot make,
 * since at build time every one of these fields is still the raw token.
 *
 * There is no `dl7d`/`dl7dClass` here: `CardLiveBox.astro` shows only the
 * TOTAL download figure, an existing build-time number
 * (`downloadsOf(project)`, from `src/data/downloads.json`), never the
 * 7-day delta the mockup originally sketched — see the comment in that
 * component. `PRJ_<ID>_DL_7D`/`_DL_7D_CLASS` were retired from this
 * registry, `write-summary.mjs` and their tests for exactly that reason:
 * a token nothing renders is not a live figure, it is dead weight in every
 * summary the systemd timer writes.
 */
export interface ProjectCardSsr {
  /** Live star count. */
  readonly stars: string;
  /**
   * Stars gained in the last 30 days, as a plain (unsigned) count — the
   * `+` and `"in 30 d"` wording come from `pages.projects.card
   * .stars30dSuffix` in `common.ts`, not from this token; see
   * `scripts/ghc/format.mjs`'s doc comment for why the PER-CARD token stays
   * plain `"int"` while the site-wide `PRJ.activity.stars30d` tile is
   * `"int-signed"`.
   */
  readonly stars30d: string;
  /** Class hiding the whole stars row: `"prj-hide"` when the repo has 0. */
  readonly starsClass: string;
  /** Class hiding the `stars30d` row: `"prj-hide"` when the delta is 0. */
  readonly stars30dClass: string;
  /** Latest stable release tag (e.g. "v3.0.0"). */
  readonly relTag: string;
  /** Release age, relative and locale-formatted ("16 days ago"). */
  readonly relAge: string;
  /** Class hiding the release meta: `"prj-hide"` when there is no release. */
  readonly relClass: string;
}

/**
 * The token registry. Keys are grouped by the block that renders them.
 * Every literal MUST match `^PRJ_[A-Z0-9_]+$` and be unique PER METRIC.
 */
export const PRJ = {
  /** "Contributions to other projects" header tiles, on /projects/. */
  upstream: {
    /** Merged PRs: code and docs only (packaging/listing counted separately). */
    codeMerged: "PRJ_CODE_MERGED",
    /**
     * Distinct upstream PROJECTS (not repos — an owner, with the
     * `contributions.yaml` `displayName` folding applied) with at least one
     * merged code/docs PR.
     */
    codeUpstreams: "PRJ_CODE_UPSTREAMS",
    /** Merged packaging/listing PRs (winget, awesome lists, registries). */
    listingMerged: "PRJ_LISTING_MERGED",
    /** PRs currently open/under review, any classification. */
    prOpen: "PRJ_PR_OPEN",
    /** Accepted answers in GitHub Discussions on repos the account owns. */
    answers: "PRJ_ANSWERS",
  },

  /** Activity band at the top of /projects/ (4 tiles). */
  activity: {
    /** Releases shipped across the active roster in the last 90 days. */
    releases90d: "PRJ_RELEASES_90D",
    /** Stars gained across the active roster in the last 30 days. */
    stars30d: "PRJ_STARS_30D",
    /** Days with a GitHub contribution in the trailing 12 months (of 365). */
    activeDays: "PRJ_ACTIVE_DAYS",
    /** Current contribution streak, in days. */
    streak: "PRJ_STREAK",
  },

  /**
   * Per-card live meta, keyed by the `ACTIVE_REPOS` id from
   * `scripts/ghc/roster.mjs`. Generated below via {@link projectTokenId} so
   * the token name can never drift from the roster by a typo; the literal
   * result is what actually ships (this loop runs at MODULE LOAD, producing
   * a plain object of string literals, same as `HLM.nodes` being written out
   * by hand — the loop just guarantees the naming rule instead of trusting a
   * human to apply it consistently across 9 repos × 6 fields).
   */
  cards: Object.fromEntries(
    ACTIVE_REPOS.map((repoId) => {
      const id = projectTokenId(repoId);
      return [
        repoId,
        {
          stars: `PRJ_${id}_STARS`,
          stars30d: `PRJ_${id}_STARS_30D`,
          starsClass: `PRJ_${id}_STARS_CLASS`,
          stars30dClass: `PRJ_${id}_STARS_30D_CLASS`,
          relTag: `PRJ_${id}_REL_TAG`,
          relAge: `PRJ_${id}_REL_AGE`,
          relClass: `PRJ_${id}_REL_CLASS`,
        },
      ];
    }),
  ) as Record<(typeof ACTIVE_REPOS)[number], ProjectCardSsr>,

  /**
   * When the JSON summary that feeds every token above was generated,
   * formatted like `HLM_AS_OF` ("2026-09-26 18:42 UTC+2"). A
   * stale-beyond-`STALE_AFTER`
   * summary still renders with this timestamp, so a reader (and
   * `check-projects-ssr.mjs`, a later task) can tell live data from stale.
   */
  asOf: "PRJ_AS_OF",
} as const;
