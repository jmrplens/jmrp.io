#!/usr/bin/env python3
"""Read-only dump of the zone rules and Worker routes the edge guards compare.

Writes workers/tools/rules-dump.json (git-ignored): the cache rules entrypoint, the
response header Transform Rules entrypoint and the Worker routes, with the time
of the dump. Only GET requests; credentials come from the repository .env and
are never printed or written. worker.test.mjs (docs-edge) reads this file for
guard G1, and edge_contract.py reads the routes for its quota note.

Usage: python3 workers/tools/dump_rules.py
"""
import datetime
import json
import pathlib
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(__file__).with_name("rules-dump.json")
ACCOUNT = "d3604ab61425cd17ccc0c6b2f14ec1dd"

ENV = {}
for line in (ROOT / ".env").read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    ENV[key.strip()] = value.strip().strip('"').strip("'")
ZONE = ENV["PRIVATE_CF_ZONE_ID"]
# Same rule as scripts/deploy-live.mjs: with PRIVATE_CF_EMAIL the key is the
# account's Global API Key, without it an API token.
if ENV.get("PRIVATE_CF_EMAIL"):
    AUTH = {"X-Auth-Email": ENV["PRIVATE_CF_EMAIL"], "X-Auth-Key": ENV["PRIVATE_CF_API_TOKEN"]}
else:
    AUTH = {"Authorization": f"Bearer {ENV['PRIVATE_CF_API_TOKEN']}"}
HEADERS = {**AUTH, "User-Agent": "jmrp-edge-guards/1.0"}


def get(path):
    """GET one API path; this script never sends any other method."""
    url = "https://api.cloudflare.com/client/v4" + path
    request = urllib.request.Request(url, method="GET", headers=HEADERS)
    try:
        with urllib.request.urlopen(request, timeout=60) as answer:
            return json.loads(answer.read())
    except urllib.error.HTTPError as error:
        raise SystemExit(f"GET {path.replace(ZONE, '<zone>')}: HTTP {error.code}") from None


def entrypoint(phase):
    body = get(f"/zones/{ZONE}/rulesets/phases/{phase}/entrypoint")["result"]
    rules = [
        {key: rule.get(key) for key in ("id", "description", "expression", "action", "action_parameters", "enabled")}
        for rule in body.get("rules", [])
    ]
    return {"id": body["id"], "version": body.get("version"), "rules": rules}


routes = [
    {key: route.get(key) for key in ("id", "pattern", "script", "request_limit_fail_open")}
    for route in get(f"/zones/{ZONE}/workers/routes")["result"]
]
dump = {
    "dumped_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "http_request_cache_settings": entrypoint("http_request_cache_settings"),
    "http_response_headers_transform": entrypoint("http_response_headers_transform"),
    "workers_routes": sorted(routes, key=lambda route: route["pattern"]),
}
OUT.write_text(json.dumps(dump, indent=1) + "\n")
print(f"wrote {OUT} at {dump['dumped_at']}: "
      f"{len(dump['http_request_cache_settings']['rules'])} cache rules, "
      f"{len(dump['http_response_headers_transform']['rules'])} response header rules, "
      f"{len(routes)} Worker routes")
