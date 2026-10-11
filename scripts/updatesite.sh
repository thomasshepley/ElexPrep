#!/bin/bash
# Pulls the latest code from the branch currently checked out and rebuilds/restarts the
# running container. One-time setup to make this runnable as a plain `updatesite` command
# is in DEPLOY.md's "Updating to a new version" section.
set -e
# $0 is the path used to invoke this script, not its real location — when run through the
# /usr/local/bin/updatesite symlink, naive `dirname "$0"` would resolve relative to
# /usr/local/bin instead of the repo, landing one directory above the real repo root entirely.
# readlink -f follows the symlink first so this works the same either way.
cd "$(dirname "$(readlink -f "$0")")/.."
git pull
docker compose up -d --build
