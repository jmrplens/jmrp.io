/**
 * The site's public URL, resolved in ONE place.
 *
 * `astro.config.mjs` used to read `process.env.PUBLIC_SITE_URL`, but Astro
 * evaluates the config before it loads `.env`, so a value set only there never
 * reached `site`: the build stayed on the default while `deploy-live.mjs`, which
 * loads `.env` itself, already announced the other URL to IndexNow and Bing.
 * The markdown-twin guard and the link disambiguator, meanwhile, hard-coded
 * `https://jmrp.io`. All three now ask this module, so changing the site URL is
 * one edit in `.env` (or one exported variable) and nothing else.
 *
 * Precedence, the same as Vite's and as `process.loadEnvFile` in deploy-live:
 * a variable already exported in the shell wins over `.env`, and `.env` wins
 * over {@link DEFAULT_SITE_URL}.
 */
import process from "node:process";

import { loadEnv } from "vite";

/** The URL the site is built for when nothing else says otherwise. */
export const DEFAULT_SITE_URL = "https://jmrp.io";

/**
 * Resolves the public site URL, without a trailing slash.
 *
 * @param {string} [root] - Directory whose `.env` files are read (the repo root
 *   when run from it, which is how Astro, the CI scripts and the post-build
 *   guards all run).
 * @returns {string} The site URL, e.g. `https://jmrp.io`.
 */
export function resolveSiteUrl(root = process.cwd()) {
  const mode =
    process.env.NODE_ENV === "development" ? "development" : "production";
  const env = loadEnv(mode, root, "PUBLIC_");
  const value = env.PUBLIC_SITE_URL || DEFAULT_SITE_URL;
  return new URL(value).href.replace(/\/+$/, "");
}
