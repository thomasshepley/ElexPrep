#!/bin/bash
# Carries out a site update asked for from the Webmaster page.
#
# The app runs in a container and can't (and shouldn't be able to) run git or Docker on this
# server itself. Instead it drops a one-word request into data/ops/, and this script, started
# by a systemd path unit on the host (see scripts/install-update-agent.sh), acts on it:
#
#   check               fetch, and report how far behind the server is and what's coming
#   update              run scripts/updatesite.sh
#   update-maintenance  run scripts/updatesite.sh --maintenance
#
# Anything else is refused. Progress goes back the same way, as plain files the app reads:
#   data/ops/state      idle | checking | updating | done | failed
#   data/ops/info       key=value lines about the last check or update
#   data/ops/log        the output of the last run
#   data/ops/incoming   commits waiting to be pulled, one per line
#   data/ops/incoming-changelog.md   the top of the incoming CHANGELOG.md
#   data/ops/history    one line per run: when, what, result, from, to, who
set -uo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."

ops=data/ops
mkdir -p "$ops"

# One run at a time; a request that arrives during a run waits for the next trigger.
exec 9>"$ops/.lock"
flock -n 9 || exit 0

date -u +%Y-%m-%dT%H:%M:%SZ > "$ops/agent"

[ -f "$ops/request" ] || exit 0
request=$(head -c 40 "$ops/request" | tr -d '[:space:]')
by=$(head -c 80 "$ops/request-by" 2>/dev/null | tr -cd '[:alnum:] ._@-')
rm -f "$ops/request" "$ops/request-by"

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
put() { # put FILE CONTENT: written whole, so the app never reads half a file
  printf '%s' "$2" > "$ops/$1.tmp" && mv -f "$ops/$1.tmp" "$ops/$1"
}
state() { put state "$1"$'\n'; }
started=$(now)
from=$(cat VERSION 2>/dev/null || echo unknown)

case "$request" in
  check)
    state checking
    : > "$ops/log"
    if ! git fetch --quiet >> "$ops/log" 2>&1; then
      put info "action=check"$'\n'"result=failed"$'\n'"finishedAt=$(now)"$'\n'"by=$by"$'\n'
      state failed
      exit 0
    fi
    branch=$(git rev-parse --abbrev-ref HEAD)
    upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo '')
    if [ -z "$upstream" ]; then
      echo "The branch $branch has no upstream to pull from." >> "$ops/log"
      put info "action=check"$'\n'"result=failed"$'\n'"branch=$branch"$'\n'"finishedAt=$(now)"$'\n'"by=$by"$'\n'
      state failed
      exit 0
    fi
    behind=$(git rev-list --count 'HEAD..@{u}')
    ahead=$(git rev-list --count '@{u}..HEAD')
    dirty=$(git status --porcelain --untracked-files=no | wc -l | tr -d ' ')
    incoming=$(git show '@{u}:VERSION' 2>/dev/null | tr -d '[:space:]')
    git log --format='%h %s' 'HEAD..@{u}' | head -60 > "$ops/incoming.tmp" && mv -f "$ops/incoming.tmp" "$ops/incoming"
    git show '@{u}:CHANGELOG.md' 2>/dev/null | head -400 > "$ops/incoming-changelog.md.tmp" && mv -f "$ops/incoming-changelog.md.tmp" "$ops/incoming-changelog.md"
    put info "action=check"$'\n'"result=ok"$'\n'"branch=$branch"$'\n'"upstream=$upstream"$'\n'"behind=$behind"$'\n'"ahead=$ahead"$'\n'"dirty=$dirty"$'\n'"currentVersion=$from"$'\n'"incomingVersion=$incoming"$'\n'"head=$(git rev-parse --short HEAD)"$'\n'"finishedAt=$(now)"$'\n'"by=$by"$'\n'
    state done
    ;;

  update | update-maintenance)
    maintenance=false
    args=()
    if [ "$request" = update-maintenance ]; then
      maintenance=true
      args=(--maintenance)
    fi
    state updating
    put info "action=update"$'\n'"maintenance=$maintenance"$'\n'"fromVersion=$from"$'\n'"startedAt=$started"$'\n'"by=$by"$'\n'
    echo "Update asked for from the Webmaster page by ${by:-someone} at $started." > "$ops/log"
    if ./scripts/updatesite.sh "${args[@]}" >> "$ops/log" 2>&1; then
      result=ok
      state done
    else
      result=failed
      # Turned on for this update, so turned off again: from the web there'd be no way back in.
      # Caddy still shows the maintenance page by itself while the app isn't answering.
      if $maintenance; then
        echo "Turning the maintenance page off again so the site can be reached." >> "$ops/log"
        ./scripts/maintenance.sh off >> "$ops/log" 2>&1 || true
      fi
      state failed
    fi
    to=$(cat VERSION 2>/dev/null || echo unknown)
    put info "action=update"$'\n'"result=$result"$'\n'"maintenance=$maintenance"$'\n'"fromVersion=$from"$'\n'"toVersion=$to"$'\n'"startedAt=$started"$'\n'"finishedAt=$(now)"$'\n'"by=$by"$'\n'
    printf '%s %s %s %s %s %s\n' "$started" "$request" "$result" "$from" "$to" "${by:--}" >> "$ops/history"
    tail -n 50 "$ops/history" > "$ops/history.tmp" && mv -f "$ops/history.tmp" "$ops/history"
    # After a successful update the agent itself may have changed; nothing to restart, as
    # systemd runs this file fresh each time.
    ;;

  *)
    echo "Refused an unknown request: '$request'." > "$ops/log"
    state failed
    ;;
esac
