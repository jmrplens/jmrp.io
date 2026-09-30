/**
 * Unit tests for the content-addressed beacon copy
 * (`src/integrations/post-build/beacon-version.ts`).
 *
 * The defect these lock down (GEO audit #11, B2): #537 versioned the beacon as
 * `/scripts/cf-beacon.js?v=<hex>`, but the edge-nonce Worker strips the query
 * from its cache key, so every version shared one 24 h edge entry. The version
 * must live in the PATH, the file behind it must hold exactly the bytes the
 * tag's integrity names, and the unversioned file must stay in the build for
 * pages cached before the change.
 *
 * Everything runs in a temp directory; nothing in the project is touched.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import {
  BEACON_URL_PATH,
  publishVersionedBeacon,
  versionedBeaconName,
} from "../../src/integrations/post-build/beacon-version.ts";

const BEACON = Buffer.from(
  '/* jmrp-beacon-hardened */(function(){if(location.hostname!=="jmrp.io")return;/* beacon */})();',
);

let distDir = "";

before(() => {
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-version-"));
});

after(() => {
  fs.rmSync(distDir, { recursive: true, force: true });
});

/** The integrity value the SRI pass computes for these bytes. */
function integrityOf(bytes) {
  return `sha512-${crypto.createHash("sha512").update(bytes).digest("base64")}`;
}

test("the name carries 12 hex digits of the SHA-512 the integrity names", () => {
  const name = versionedBeaconName(BEACON);
  assert.match(name, /^cf-beacon\.[0-9a-f]{12}\.js$/);
  const fromIntegrity = Buffer.from(
    integrityOf(BEACON).slice("sha512-".length),
    "base64",
  )
    .toString("hex")
    .slice(0, 12);
  assert.equal(name, `cf-beacon.${fromIntegrity}.js`);
});

test("a one-byte change is a new name", () => {
  const changed = Buffer.concat([BEACON, Buffer.from(" ")]);
  assert.notEqual(versionedBeaconName(changed), versionedBeaconName(BEACON));
});

test("returns null and writes nothing when the build has no beacon", () => {
  assert.equal(publishVersionedBeacon(distDir), null);
  assert.equal(fs.existsSync(path.join(distDir, "scripts")), false);
});

test("publishes a same-bytes copy under a path, keeping the original", () => {
  const scripts = path.join(distDir, "scripts");
  fs.mkdirSync(scripts, { recursive: true });
  const original = path.join(distDir, BEACON_URL_PATH);
  fs.writeFileSync(original, BEACON);

  const src = publishVersionedBeacon(distDir);
  assert.equal(src, `/scripts/${versionedBeaconName(BEACON)}`);
  // A path, not a query: the Worker keys its cache on exactly this.
  assert.doesNotMatch(src, /\?/);

  const copy = fs.readFileSync(path.join(distDir, src));
  assert.deepEqual(copy, BEACON);
  assert.equal(integrityOf(copy), integrityOf(fs.readFileSync(original)));
  assert.deepEqual(fs.readFileSync(original), BEACON);
});
