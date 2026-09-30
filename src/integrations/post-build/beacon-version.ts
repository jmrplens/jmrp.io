/**
 * The Cloudflare beacon under a name that changes when its bytes do.
 *
 * Split out of `html.ts` so `node --test` can load it straight from source: it
 * imports only Node builtins (the same reason `typography.ts` stands alone).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * The URL `BaseHead.astro` emits, and the file the pre-build downloads into
 * `public/`. It stays in every build: a page cached before the beacon was
 * versioned still names it.
 */
export const BEACON_URL_PATH = "/scripts/cf-beacon.js";

/** Hex digits of the SHA-512 digest the versioned name keeps. */
const VERSION_HEX_LENGTH = 12;

/**
 * The content-addressed file name for a given beacon.
 *
 * Twelve hex digits of the same SHA-512 the tag's `integrity` carries, so the
 * name and the integrity can only change together.
 *
 * @param bytes - The beacon exactly as it is served (already hardened).
 * @returns A name such as `cf-beacon.b929e98b003b.js`.
 */
export function versionedBeaconName(bytes: Uint8Array): string {
  const hex = crypto
    .createHash("sha512")
    .update(bytes)
    .digest("hex")
    .slice(0, VERSION_HEX_LENGTH);
  return `cf-beacon.${hex}.js`;
}

/**
 * Writes the content-addressed copy of the beacon next to the original.
 *
 * #537 versioned the beacon with `?v=`, which fixed the browser caches, but
 * the edge-nonce Worker drops the query from the request it sends to the
 * origin, and that URL is its cache key: every `?v=` shared ONE edge entry
 * with a 24 h TTL (GEO audit #11, B2). A deploy that changed the beacon and
 * then failed its Cloudflare purge would pair new HTML, whose integrity names
 * the new bytes, with the old bytes still cached at the edge, and SRI would
 * block the script until that entry expired. A new PATH is a new cache key for
 * every layer that keys on the path, whatever it does with the query.
 *
 * A copy, not a rename: the unversioned file stays in the build, so HTML
 * cached before this change still finds a beacon.
 *
 * Must run after the beacon is hardened and before any page is processed, so
 * the copy holds the final bytes and the SRI pass hashes the same bytes under
 * the new name.
 *
 * @param distDir - The build output directory.
 * @returns The URL path of the copy, or `null` when the build has no beacon.
 */
export function publishVersionedBeacon(distDir: string): string | null {
  const scriptsDir = path.join(distDir, "scripts");
  const source = path.join(scriptsDir, path.basename(BEACON_URL_PATH));
  if (!fs.existsSync(source)) return null;
  const bytes = fs.readFileSync(source);
  const name = versionedBeaconName(bytes);
  fs.writeFileSync(path.join(scriptsDir, name), bytes);
  return `/scripts/${name}`;
}
