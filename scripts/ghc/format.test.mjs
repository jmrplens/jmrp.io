/**
 * Guards the `PRJ_*` token formatting spec (`format.mjs`) that
 * `vite-plugin-dev-prj-tokens.ts` uses for dev/preview and the future
 * `projects_ssr_metrics.lua` must mirror — the exact wording and grouping
 * both a reader and that Lua port depend on.
 *
 * @module
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { formatValue, kindForToken } from "./format.mjs";

// ── kindForToken ────────────────────────────────────────────────────────

test("kindForToken: PRJ_AS_OF is as-of", () => {
  assert.equal(kindForToken("PRJ_AS_OF"), "as-of");
});

test("kindForToken: the site-wide PRJ_STARS_30D is int-signed", () => {
  assert.equal(kindForToken("PRJ_STARS_30D"), "int-signed");
});

test("kindForToken: a per-card *_STARS_30D is plain int, not int-signed", () => {
  assert.equal(kindForToken("PRJ_PHONOMETRY_STARS_30D"), "int");
});

test("kindForToken: *_REL_AGE is rel-days", () => {
  assert.equal(kindForToken("PRJ_PHONOMETRY_REL_AGE"), "rel-days");
});

test("kindForToken: *_REL_TAG is tag", () => {
  assert.equal(kindForToken("PRJ_PHONOMETRY_REL_TAG"), "tag");
});

test("kindForToken: *_CLASS is tag", () => {
  assert.equal(kindForToken("PRJ_PHONOMETRY_STARS_30D_CLASS"), "tag");
  assert.equal(kindForToken("PRJ_PHONOMETRY_REL_CLASS"), "tag");
});

test("kindForToken: flat counters and per-card *_STARS default to int", () => {
  for (const token of [
    "PRJ_CODE_MERGED",
    "PRJ_CODE_UPSTREAMS",
    "PRJ_LISTING_MERGED",
    "PRJ_PR_OPEN",
    "PRJ_ANSWERS",
    "PRJ_RELEASES_90D",
    "PRJ_ACTIVE_DAYS",
    "PRJ_STREAK",
    "PRJ_PHONOMETRY_STARS",
  ]) {
    assert.equal(kindForToken(token), "int");
  }
});

// ── formatValue: int ────────────────────────────────────────────────────

test("formatValue: int groups thousands with a comma in en", () => {
  assert.equal(formatValue("PRJ_CODE_MERGED", 12_345, "en"), "12,345");
});

test("formatValue: int groups thousands with a dot in es", () => {
  assert.equal(formatValue("PRJ_CODE_MERGED", 12_345, "es"), "12.345");
});

test("formatValue: int below 1000 is unchanged either locale", () => {
  assert.equal(formatValue("PRJ_ANSWERS", 13, "en"), "13");
  assert.equal(formatValue("PRJ_ANSWERS", 13, "es"), "13");
});

test("formatValue: int null renders the dash", () => {
  assert.equal(formatValue("PRJ_ANSWERS", null, "en"), "—");
});

test("formatValue: an unrecognized locale falls back to en", () => {
  assert.equal(formatValue("PRJ_CODE_MERGED", 1234, "fr"), "1,234");
});

// ── formatValue: int-signed ─────────────────────────────────────────────

test("formatValue: int-signed prefixes a positive value with +", () => {
  assert.equal(formatValue("PRJ_STARS_30D", 42, "en"), "+42");
  assert.equal(formatValue("PRJ_STARS_30D", 1234, "es"), "+1.234");
});

test("formatValue: int-signed does not prefix zero", () => {
  assert.equal(formatValue("PRJ_STARS_30D", 0, "en"), "0");
});

test("formatValue: int-signed keeps the grouped separator's own minus for a negative value", () => {
  assert.equal(formatValue("PRJ_STARS_30D", -3, "en"), "-3");
});

// ── formatValue: tag ────────────────────────────────────────────────────

test("formatValue: tag passes a release tag through unchanged", () => {
  assert.equal(
    formatValue("PRJ_GITLAB_MCP_SERVER_REL_TAG", "v3.0.0", "en"),
    "v3.0.0",
  );
});

test("formatValue: tag passes an empty CLASS string through as empty (not a dash)", () => {
  assert.equal(
    formatValue("PRJ_GITLAB_MCP_SERVER_STARS_30D_CLASS", "", "en"),
    "",
  );
});

test("formatValue: tag passes a non-empty CLASS string through unchanged", () => {
  assert.equal(
    formatValue("PRJ_GITLAB_MCP_SERVER_STARS_30D_CLASS", "prj-hide", "en"),
    "prj-hide",
  );
});

test("formatValue: tag renders the dash for a missing release tag", () => {
  assert.equal(formatValue("PRJ_GITLAB_MCP_SERVER_REL_TAG", null, "en"), "—");
});

// ── formatValue: rel-days ───────────────────────────────────────────────

test("formatValue: rel-days reads naturally in English", () => {
  assert.equal(formatValue("PRJ_X_REL_AGE", 0, "en"), "today");
  assert.equal(formatValue("PRJ_X_REL_AGE", 1, "en"), "1 day ago");
  assert.equal(formatValue("PRJ_X_REL_AGE", 16, "en"), "16 days ago");
  assert.equal(formatValue("PRJ_X_REL_AGE", 1234, "en"), "1,234 days ago");
});

test("formatValue: rel-days reads naturally in Spanish", () => {
  assert.equal(formatValue("PRJ_X_REL_AGE", 0, "es"), "hoy");
  assert.equal(formatValue("PRJ_X_REL_AGE", 1, "es"), "hace 1 día");
  assert.equal(formatValue("PRJ_X_REL_AGE", 16, "es"), "hace 16 días");
  assert.equal(formatValue("PRJ_X_REL_AGE", 1234, "es"), "hace 1.234 días");
});

test("formatValue: rel-days treats a non-positive age as today", () => {
  assert.equal(formatValue("PRJ_X_REL_AGE", -1, "en"), "today");
});

// ── formatValue: as-of ──────────────────────────────────────────────────

test("formatValue: as-of renders Europe/Madrid winter time (CET, UTC+1)", () => {
  // 2026-01-15T10:00:00 UTC -> 11:00 CET
  assert.equal(
    formatValue("PRJ_AS_OF", "2026-01-15T10:00:00", "en"),
    "2026-01-15 11:00 UTC+1",
  );
});

test("formatValue: as-of renders Europe/Madrid summer time (CEST, UTC+2)", () => {
  // 2026-07-15T10:00:00 UTC -> 12:00 CEST
  assert.equal(
    formatValue("PRJ_AS_OF", "2026-07-15T10:00:00", "en"),
    "2026-07-15 12:00 UTC+2",
  );
});

test("formatValue: as-of tolerates InfluxDB's 9-digit nanosecond fraction", () => {
  assert.equal(
    formatValue("PRJ_AS_OF", "2026-09-26T13:03:19.304686700", "en"),
    "2026-09-26 15:03 UTC+2",
  );
});

test("formatValue: as-of is locale-independent (same clock, no words)", () => {
  assert.equal(
    formatValue("PRJ_AS_OF", "2026-01-15T10:00:00", "es"),
    "2026-01-15 11:00 UTC+1",
  );
});

test("formatValue: as-of renders the dash for an unparsable timestamp", () => {
  assert.equal(formatValue("PRJ_AS_OF", "not-a-date", "en"), "—");
  assert.equal(formatValue("PRJ_AS_OF", null, "en"), "—");
});
