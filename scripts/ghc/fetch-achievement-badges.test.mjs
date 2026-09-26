/**
 * Guards the badge self-hosting: only GitHub's own badge URL for exactly
 * the slug and tier is ever fetched, a committed file is kept, and every
 * failure degrades to a warning instead of failing the build.
 *
 * @module
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import sharp from "sharp";

import {
  BADGE_SIZE,
  badgeFileName,
  BADGES_DIR,
  ensureAchievementBadges,
  ensureGitlabAchievementBadges,
  isBadgeUrl,
  isGitlabBadgeUrl,
} from "./fetch-achievement-badges.mjs";

const GOLD =
  "https://github.githubassets.com/assets/pull-shark-gold-90985540b385.png";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ghc-badges-"));
}

function fakeFetch(body, status = 200) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    return new Response(body, { status });
  };
  return { impl, calls };
}

test("isBadgeUrl accepts only the badge for this slug and tier", () => {
  assert.equal(isBadgeUrl(GOLD, "pull-shark", "gold"), true);
  assert.equal(isBadgeUrl(GOLD, "pull-shark", "silver"), false);
  assert.equal(isBadgeUrl(GOLD, "starstruck", "gold"), false);
  assert.equal(
    isBadgeUrl(
      "https://evil.example/assets/pull-shark-gold-90985540b385.png",
      "pull-shark",
      "gold",
    ),
    false,
  );
});

test("a committed badge is kept and nothing is requested", async () => {
  const root = tempRoot();
  const file = path.join(root, BADGES_DIR, badgeFileName("pull-shark", "gold"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "committed");
  const { impl, calls } = fakeFetch("unused");
  const out = await ensureAchievementBadges(
    [{ achievement: "pull-shark", tierName: "gold", image: GOLD }],
    { root, fetchImpl: impl, warn: () => {} },
  );
  assert.deepEqual(out.kept, ["pull-shark-gold.png"]);
  assert.equal(calls.length, 0);
  assert.equal(fs.readFileSync(file, "utf8"), "committed");
});

test("a missing badge is downloaded and resized", async () => {
  const root = tempRoot();
  const png = await sharp({
    create: {
      width: 296,
      height: 296,
      channels: 4,
      background: { r: 200, g: 160, b: 40, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const { impl } = fakeFetch(png);
  const out = await ensureAchievementBadges(
    [{ achievement: "pull-shark", tierName: "gold", image: GOLD }],
    { root, fetchImpl: impl },
  );
  assert.deepEqual(out.fetched, ["pull-shark-gold.png"]);
  const meta = await sharp(
    path.join(root, BADGES_DIR, "pull-shark-gold.png"),
  ).metadata();
  assert.equal(meta.width, BADGE_SIZE);
  assert.equal(meta.height, BADGE_SIZE);
});

test("a failed or non-PNG download warns and writes nothing", async () => {
  for (const [body, status] of [
    ["not found", 404],
    ["<html>not a png</html>", 200],
  ]) {
    const root = tempRoot();
    const warnings = [];
    const out = await ensureAchievementBadges(
      [{ achievement: "pull-shark", tierName: "gold", image: GOLD }],
      {
        root,
        fetchImpl: fakeFetch(body, status).impl,
        warn: (line) => {
          warnings.push(line);
        },
      },
    );
    assert.deepEqual(out.failed, ["pull-shark-gold.png"]);
    assert.equal(warnings.length, 1);
    assert.equal(fs.existsSync(path.join(root, BADGES_DIR)), false);
  }
});

test("a URL for another host or tier is never requested", async () => {
  const root = tempRoot();
  const { impl, calls } = fakeFetch("unused");
  const out = await ensureAchievementBadges(
    [
      {
        achievement: "pull-shark",
        tierName: "gold",
        image: "https://evil.example/pull-shark-gold-0a.png",
      },
      { achievement: "starstruck", tierName: "default", image: null },
    ],
    { root, fetchImpl: impl, warn: () => {} },
  );
  assert.equal(calls.length, 0);
  assert.equal(out.failed.length, 2);
});

/**
 * The same URL over plain HTTP, built at run time.
 *
 * @param {string} url - An https URL.
 * @returns {string} The insecure variant.
 */
function insecureUrl(url) {
  const parsed = new URL(url);
  parsed.protocol = "http:";
  return parsed.href;
}

test("isGitlabBadgeUrl accepts only GitLab.com achievement avatars", () => {
  assert.equal(
    isGitlabBadgeUrl(
      "https://gitlab.com/uploads/-/system/achievements/achievement/avatar/61/contributor-level-3.png?v=1765202121",
    ),
    true,
  );
  for (const url of [
    "https://evil.example/uploads/-/system/achievements/achievement/avatar/61/x.png",
    "https://gitlab.com/uploads/-/system/user/avatar/1/x.png",
    "https://gitlab.com/uploads/-/system/achievements/achievement/avatar/61/x.svg",
    "https://gitlab.com/uploads/-/system/achievements/achievement/avatar/61/x.png?next=https://evil.example",
    insecureUrl(
      "https://gitlab.com/uploads/-/system/achievements/achievement/avatar/61/x.png",
    ),
  ]) {
    assert.equal(isGitlabBadgeUrl(url), false, url);
  }
});

test("ensureGitlabAchievementBadges stores <slug>.png and never fetches a bad URL", async () => {
  const root = tempRoot();
  const png = await sharp({
    create: { width: 256, height: 256, channels: 4, background: "#fc6d26" },
  })
    .png()
    .toBuffer();
  const fetched = [];
  const outcome = await ensureGitlabAchievementBadges(
    [
      {
        achievement: "gitlab-level-3-contributor",
        image:
          "https://gitlab.com/uploads/-/system/achievements/achievement/avatar/61/contributor-level-3.png?v=1",
      },
      {
        achievement: "gitlab-other",
        image: "https://evil.example/x.png",
      },
    ],
    {
      root,
      fetchImpl: async (url) => {
        fetched.push(String(url));
        return new Response(png);
      },
      warn: () => {},
    },
  );
  assert.deepEqual(outcome.fetched, ["gitlab-level-3-contributor.png"]);
  assert.deepEqual(outcome.failed, ["gitlab-other.png"]);
  assert.equal(fetched.length, 1);
  const meta = await sharp(
    path.join(root, BADGES_DIR, "gitlab-level-3-contributor.png"),
  ).metadata();
  assert.equal(meta.width, BADGE_SIZE);
});
