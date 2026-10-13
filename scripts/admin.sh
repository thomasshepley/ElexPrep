#!/bin/bash
# Thin wrapper around the admin CLI (server/src/cli.ts, built to dist/cli.js) running inside
# the elexprep container - run this from anywhere via the /usr/local/bin/admin symlink set up
# in DEPLOY.md's "Admin CLI" section, or directly as ./scripts/admin.sh <command> ...
set -e
cd "$(dirname "$(readlink -f "$0")")/.."
docker compose exec elexprep node dist/cli.js "$@"
