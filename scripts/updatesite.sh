#!/bin/bash
# Pulls the latest code from the branch currently checked out and rebuilds/restarts the
# running container. One-time setup to make this runnable as a plain `updatesite` command
# is in DEPLOY.md's "Updating to a new version" section.
set -e
cd "$(dirname "$0")/.."
git pull
docker compose up -d --build
