#!/bin/bash
# Updates the live site with as little downtime as possible:
#
#   1. pulls the latest code;
#   2. builds the new image while the current version keeps serving everyone;
#   3. swaps the app container over - Caddy holds requests for those few seconds instead of
#      failing them, and shows the maintenance page if it takes longer;
#   4. waits until the new version answers, then reloads Caddy if its config changed.
#
#   updatesite                    # normal update, no maintenance page
#   updatesite --maintenance      # maintenance page on for the switch-over (big migrations)
#
# One-time setup to make this runnable as a plain `updatesite` command is in DEPLOY.md's
# "Updating to a new version" section.
set -euo pipefail
# $0 is the path used to invoke this script, not its real location - when run through the
# /usr/local/bin/updatesite symlink, naive `dirname "$0"` would resolve relative to
# /usr/local/bin. readlink -f follows the symlink first so this works the same either way.
cd "$(dirname "$(readlink -f "$0")")/.."

use_maintenance=false
[ "${1:-}" = "--maintenance" ] && use_maintenance=true

before=$(git rev-parse HEAD)
git pull --ff-only
version=$(cat VERSION)

echo "Building v$version while the site stays up..."
docker compose build elexprep

if $use_maintenance; then
  ./scripts/maintenance.sh on "Updating to v$version"
fi

echo "Switching over to v$version..."
docker compose up -d --no-build

echo -n "Waiting for v$version to answer"
ok=false
for _ in $(seq 1 90); do
  sleep 2
  echo -n "."
  if curl -fsS http://127.0.0.1:4000/api/version 2>/dev/null | grep -q "\"version\":\"$version\""; then
    ok=true
    break
  fi
done
echo

if ! $ok; then
  echo "v$version did not come up within 3 minutes. Recent logs:" >&2
  docker compose logs --tail 40 elexprep >&2
  if $use_maintenance; then
    echo "Maintenance mode is still ON. Run 'maintenance off' once it's fixed." >&2
  fi
  exit 1
fi

# The Caddy config folder is mounted live; apply a changed config without restarting Caddy.
if ! git diff --quiet "$before" HEAD -- deploy/caddy; then
  echo "Reloading Caddy's config..."
  docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile
fi

if $use_maintenance; then
  ./scripts/maintenance.sh off
fi

# Old images pile up on a small disk otherwise.
docker image prune -f > /dev/null

echo "Live on v$version."
