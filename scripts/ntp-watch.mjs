#!/usr/bin/env node
/**
 * Records the host's time-keeping state so a repeat of 2026-09-01 can be
 * investigated from evidence instead of reconstructed afterwards.
 *
 * That day every `Persistent=true` daily timer on the box re-fired in batches —
 * `apt-daily-upgrade` six times, `logrotate` five, the traffic report four, for
 * units scheduled once a day. systemd re-arms realtime timers when the clock is
 * stepped, and `systemd-timesyncd` was reporting over a YEAR of jitter against
 * the router at 192.168.0.1. By the time anyone looked, the clock itself was
 * correct and every source agreed to the millisecond, so the disturbance left
 * nothing behind but that one poisoned statistic and a stray Tor log line.
 *
 * The point of this script is that next time there IS something behind.
 *
 * Each run appends one JSON line with three independent views, so a
 * disagreement between them localizes the fault:
 *
 *   - what timesyncd believes (its server, jitter, poll interval, frequency);
 *   - what the clock actually is, measured directly against the router AND a
 *     public server, because "the router is lying" and "the host has drifted"
 *     look identical from one source alone;
 *   - when each daily timer last fired, read from the stamp mtimes under
 *     /var/lib/systemd/timers, which is what makes a re-fire visible at all.
 *
 * Anomalies are flagged rather than merely recorded: a line carrying `flags` is
 * the one to look at. Nothing is sent anywhere — this only writes.
 */

import { execFileSync } from "node:child_process";
import dgram from "node:dgram";
import fs from "node:fs";
import path from "node:path";

const LOG = "/var/log/ntp-watch.jsonl";
const STAMPS = "/var/lib/systemd/timers";
const PUBLIC_NTP = "time.cloudflare.com";

/** Offset in seconds between this host's clock and an NTP server's. */
function ntpOffset(host, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket("udp4");
    const packet = Buffer.alloc(48);
    // First byte of an NTP client packet: leap indicator 0, version 3, mode 3,
    // which packs to 27. Decimal rather than 0x1b because Prettier lowercases
    // hex while unicorn wants uppercase digits, and rather than a shift
    // expression because `3 << 3` reads to sonarjs as a duplicated operand.
    packet[0] = 27;
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      try {
        sock.close();
      } catch {
        /* already closed */
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish({ error: "timeout" }), timeoutMs);
    const t0 = Date.now() / 1000;
    sock.on("message", (msg) => {
      clearTimeout(timer);
      const t3 = Date.now() / 1000;
      // Seconds since 1900 → since 1970. Receive is at 32, transmit at 40.
      const t1 =
        msg.readUInt32BE(32) + msg.readUInt32BE(36) / 2 ** 32 - 2_208_988_800;
      const t2 =
        msg.readUInt32BE(40) + msg.readUInt32BE(44) / 2 ** 32 - 2_208_988_800;
      finish({
        offset: Number(((t1 - t0 + (t2 - t3)) / 2).toFixed(6)),
        stratum: msg[1],
      });
    });
    sock.on("error", (e) => {
      clearTimeout(timer);
      finish({ error: String(e.message ?? e) });
    });
    sock.send(packet, 123, host, (e) => {
      if (!e) {
        return;
      }

      clearTimeout(timer);
      finish({ error: String(e.message ?? e) });
    });
  });
}

function sh(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      timeout: 10_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

/** timesyncd's own view, as key=value pairs. */
function timesyncState() {
  const out = sh("/usr/bin/timedatectl", ["show-timesync", "--all"]);
  const get = (k) => new RegExp(`^${k}=(.*)$`, "m").exec(out)?.[1] ?? null;
  // Jitter is NOT a top-level key: it lives inside the `NTPMessage={...}` blob,
  // so an anchored `^Jitter=` silently yields null — which is exactly the field
  // that read "1y 1month 2w" on the day this script exists for. Matched
  // unanchored on purpose.
  const jitter = /Jitter=([^,}]+)/.exec(out)?.[1]?.trim() ?? null;
  return {
    server: get("ServerName"),
    pollIntervalUSec: get("PollIntervalUSec"),
    jitter,
    frequency: get("Frequency"),
    rootDistanceMax: get("RootDistanceMaxUSec"),
  };
}

/** Last-fire time of every persistent timer, from the stamp mtimes. */
function timerStamps() {
  const stamps = {};
  try {
    for (const f of fs.readdirSync(STAMPS)) {
      if (!f.startsWith("stamp-")) continue;
      const name = f.replace(/^stamp-/, "").replace(/\.timer$/, "");
      stamps[name] = fs.statSync(path.join(STAMPS, f)).mtime.toISOString();
    }
  } catch {
    /* directory unreadable; recorded as empty */
  }
  return stamps;
}

/**
 * systemd time spans ("10.058ms", "2min 3s", "1y 1month 2w 8h 14min 44s") to
 * seconds, so jitter can be compared against a threshold instead of against the
 * string "0". Without this the flag fires on every healthy sample, and a
 * monitor that flags everything is read as noise and then not read at all.
 */
function spanToSeconds(span) {
  if (!span) return null;
  const units = {
    us: 1e-6,
    ms: 1e-3,
    s: 1,
    sec: 1,
    min: 60,
    h: 3600,
    hour: 3600,
    d: 86_400,
    day: 86_400,
    w: 604_800,
    week: 604_800,
    month: 2_629_800,
    y: 31_557_600,
    year: 31_557_600,
  };
  let total = 0;
  let matched = false;
  for (const [, n, u] of span.matchAll(/([0-9.]+)\s*([a-z]+)/gi)) {
    const factor =
      units[u.toLowerCase().replace(/s$/, "")] ?? units[u.toLowerCase()];
    if (factor === undefined) continue;
    total += Number.parseFloat(n) * factor;
    matched = true;
  }
  return matched ? total : null;
}

const now = new Date();
const [routerNtp, publicNtp] = await Promise.all([
  // The LAN gateway is the NTP server this host actually uses. The literal is
  // only a fallback for timesyncd being unreadable, and a wrong guess surfaces
  // as an unreachable flag rather than as bad data.
  // eslint-disable-next-line sonarjs/no-hardcoded-ip -- see above
  ntpOffset(timesyncState().server ?? "192.168.0.1"),
  ntpOffset(PUBLIC_NTP),
]);
const sync = timesyncState();
const stamps = timerStamps();

// What makes a line worth opening. Thresholds are deliberately loose: this is
// evidence gathering, not alerting, and a false flag costs nothing but a look.
const flags = [];
const jitterSec = spanToSeconds(sync.jitter);
// A second of jitter on a LAN NTP server is already absurd; the day this script
// exists for showed over thirty million.
if (jitterSec !== null && jitterSec > 1) flags.push(`jitter=${sync.jitter}`);
for (const [name, r] of [
  ["router", routerNtp],
  ["public", publicNtp],
]) {
  if (r.error) flags.push(`${name}-unreachable:${r.error}`);
  else if (Math.abs(r.offset) > 1) flags.push(`${name}-offset=${r.offset}s`);
}
if (
  routerNtp.offset !== undefined &&
  publicNtp.offset !== undefined &&
  Math.abs(routerNtp.offset - publicNtp.offset) > 1
) {
  flags.push(
    `sources-disagree=${(routerNtp.offset - publicNtp.offset).toFixed(3)}s`,
  );
}

const line = {
  ts: now.toISOString(),
  uptimeSec: Math.round(
    fs.readFileSync("/proc/uptime", "utf8").split(" ", 1)[0] * 1,
  ),
  timesyncd: { ...sync, jitterSec },
  ntp: { router: routerNtp, public: publicNtp },
  stamps,
  ...(flags.length > 0 && { flags }),
};

fs.appendFileSync(LOG, JSON.stringify(line) + "\n");
if (process.argv.includes("--print"))
  console.log(JSON.stringify(line, null, 2));
else
  console.log(
    `[ntp-watch] ${now.toISOString()}${flags.length > 0 ? "  FLAGS: " + flags.join(" ") : "  ok"}`,
  );
