#!/usr/bin/env python3
"""Workers Free quota check, read-only.

Answers: did the account reach 100,000 requests in a UTC day, so that the
routes with fail_open passed straight to the origin without the Worker?

With fail_open nothing fails visibly when the quota runs out, so the only trace
is in the counters: invocations stop near 100,000 and the hours before 00:00 UTC
stay empty. The query reads the same invocation counts as the Workers analytics.

Run from the repository root:
    python3 workers/tools/check_quota.py [YYYY-MM-DD]

The date is where to start; by default 2026-11-04, when fail_open went on.
"""
import datetime
import json
import pathlib
import sys
import urllib.request

ACCOUNT = "d3604ab61425cd17ccc0c6b2f14ec1dd"
LIMIT = 100_000
WATCH = 90_000
API = "https://api.cloudflare.com/client/v4"


def load_env():
    env = {}
    for line in (pathlib.Path(__file__).resolve().parents[2] / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip().strip("\"'")
    return env


ENV = load_env()
# Same rule as scripts/deploy-live.mjs: with PRIVATE_CF_EMAIL the key is the
# account's Global API Key, without it an API token.
if ENV.get("PRIVATE_CF_EMAIL"):
    AUTH = {"X-Auth-Email": ENV["PRIVATE_CF_EMAIL"], "X-Auth-Key": ENV["PRIVATE_CF_API_TOKEN"]}
else:
    AUTH = {"Authorization": f"Bearer {ENV['PRIVATE_CF_API_TOKEN']}"}
HEADERS = {**AUTH, "Content-Type": "application/json"}


def graphql(query, variables):
    body = json.dumps({"query": query, "variables": variables}).encode()
    request = urllib.request.Request(f"{API}/graphql", body, HEADERS)
    data = json.load(urllib.request.urlopen(request, timeout=60))
    if not data.get("data"):
        sys.exit(f"GraphQL error: {data.get('errors')}")
    return data["data"]["viewer"]["accounts"][0]["workersInvocationsAdaptive"]


DAILY = """query($a:String!,$s:Date!,$e:Date!){viewer{accounts(filter:{accountTag:$a}){
workersInvocationsAdaptive(limit:1000,filter:{date_geq:$s,date_lt:$e}){
dimensions{date scriptName} sum{requests}}}}}"""

HOURLY = """query($a:String!,$s:Time!,$e:Time!){viewer{accounts(filter:{accountTag:$a}){
workersInvocationsAdaptive(limit:1000,filter:{datetime_geq:$s,datetime_lt:$e}){
dimensions{datetimeHour} sum{requests}}}}}"""


def last_active_hour(day):
    """Hour of the last invocation that day, as a two-digit string."""
    rows = graphql(
        HOURLY,
        {"a": ACCOUNT, "s": f"{day}T00:00:00Z", "e": f"{day}T23:59:59Z"},
    )
    hours = sorted(r["dimensions"]["datetimeHour"][11:13] for r in rows if r["sum"]["requests"])
    return hours[-1] if hours else "--"


def day_note(date, total, today, now):
    """The note for one day, and whether that day reached the quota."""
    note = f"today, until {now:%H:%M} UTC" if date == str(today) else ""
    if total < WATCH:
        return note, False
    last = last_active_hour(date)
    note = f"{note} last active hour {last}".strip()
    if total >= LIMIT * 0.99 or (date != str(today) and last < "23"):
        return f"QUOTA REACHED, Worker skipped until 00:00 UTC. {note}", True
    return note, False


def print_fail_open():
    """Warns about any Worker route whose fail_open is off."""
    request = urllib.request.Request(f"{API}/zones/{ENV['PRIVATE_CF_ZONE_ID']}/workers/routes", headers=HEADERS)
    routes = json.load(urllib.request.urlopen(request, timeout=40))["result"]
    off = [r["pattern"] for r in routes if r.get("script") and not r.get("request_limit_fail_open")]
    if off:
        print(f"WARNING, fail_open is off on: {', '.join(off)}. A plain wrangler deploy resets it.")
    else:
        print("fail_open is on in every Worker route.")


def main():
    since = sys.argv[1] if len(sys.argv) > 1 else "2026-11-04"
    now = datetime.datetime.now(datetime.timezone.utc)
    today = now.date()
    tomorrow = today + datetime.timedelta(days=1)
    rows = graphql(DAILY, {"a": ACCOUNT, "s": since, "e": str(tomorrow)})

    days = {}
    for row in rows:
        day = days.setdefault(row["dimensions"]["date"], {})
        day[row["dimensions"]["scriptName"]] = row["sum"]["requests"]

    hit = []
    print(f"{'date':12}{'total':>9}{'% quota':>9}{'docs-edge':>11}{'edge-nonce':>12}{'mcp':>8}  note")
    for date in sorted(days):
        day = days[date]
        total = sum(day.values())
        note, reached = day_note(date, total, today, now)
        if reached:
            hit.append(date)
        print(
            f"{date:12}{total:>9}{100 * total / LIMIT:>8.0f}%"
            f"{day.get('docs-edge', 0):>11}{day.get('edge-nonce', 0):>12}"
            f"{day.get('edge-nonce-mcp', 0):>8}  {note}"
        )

    print()
    if hit:
        print(f"Quota reached on {len(hit)} day(s): {', '.join(hit)}")
    else:
        print("Quota not reached in this period.")

    print_fail_open()


if __name__ == "__main__":
    main()
