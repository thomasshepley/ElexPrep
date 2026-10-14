#!/bin/bash
# Maintenance mode for the live site: while it's on, every visitor gets the "Down for
# maintenance" page (deploy/maintenance/index.html) from Caddy and the app itself isn't
# reached at all - safe for rebuilding, restoring a backup, or anything else that needs the
# site quiet. Takes effect immediately, no restart.
#
#   maintenance on                 # turn it on
#   maintenance on "Back by 10pm"  # with a note shown on the page
#   maintenance off
#   maintenance status
#
# You can still reach the app itself while it's on, over the SSH tunnel to 127.0.0.1:4000
# (see DEPLOY.md), to check a new version before reopening.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
dir=deploy/maintenance

case "${1:-status}" in
  on)
    printf '%s\n' "${2:-}" > "$dir/message.txt"
    date -u +%Y-%m-%dT%H:%M:%SZ > "$dir/ON"
    echo "Maintenance mode is ON - visitors see the maintenance page.${2:+ Note: $2}"
    ;;
  off)
    rm -f "$dir/ON" "$dir/message.txt"
    echo "Maintenance mode is off - the site is open."
    ;;
  status)
    if [ -f "$dir/ON" ]; then
      echo "Maintenance mode is ON (since $(cat "$dir/ON"))."
      [ -s "$dir/message.txt" ] && echo "Note: $(cat "$dir/message.txt")"
    else
      echo "Maintenance mode is off."
    fi
    ;;
  *)
    echo "Usage: maintenance on [\"note\"] | off | status" >&2
    exit 1
    ;;
esac
