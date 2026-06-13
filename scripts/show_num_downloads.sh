#!/bin/bash
# How many times RizlDizl.dmg has been downloaded (and page views), all-time
# and last 30 days, from the rizldizl_web Analytics Engine dataset.
#
# One-time setup: create a Cloudflare API token with permission
#   Account › Account Analytics › Read
# then export it (and your account id):
#   export CF_ACCOUNT_ID=<your-cloudflare-account-id>
#   export CF_API_TOKEN=...        # keep this out of shell history / git
#
# Usage: website/scripts/show_num_downloads.sh
set -euo pipefail

: "${CF_ACCOUNT_ID:?set CF_ACCOUNT_ID}"
: "${CF_API_TOKEN:?set CF_API_TOKEN (Account Analytics: Read)}"

run() {
  # -f so HTTP 4xx/5xx fails the pipeline (with set -e) instead of printing
  # bogus totals; -S still surfaces the error message.
  curl -fsS "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/analytics_engine/sql" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" --data "$1"
}

# _sample_interval weights each row so sampled data still totals correctly.
all_time="SELECT blob1 AS event, sum(_sample_interval) AS n
          FROM rizldizl_web GROUP BY event"
last_30="SELECT blob1 AS event, sum(_sample_interval) AS n
         FROM rizldizl_web
         WHERE timestamp > now() - INTERVAL '30' DAY GROUP BY event"

pretty() {
  # Look the counts up BEFORE the f-strings so no quotes/backslashes appear
  # inside f-string expressions (those raise SyntaxError before Python 3.12).
  python3 -c '
import json, sys
m = {r["event"]: int(float(r["n"])) for r in json.load(sys.stdin).get("data", [])}
dl = m.get("download", 0)
pv = m.get("pageview", 0)
print(f"  downloads: {dl:>8,}")
print(f"  pageviews: {pv:>8,}")
'
}

echo "RizlDizl — all time:"
run "$all_time" | pretty
echo "RizlDizl — last 30 days:"
run "$last_30" | pretty
