#!/bin/bash
# Sets up the host-side agent that lets the Webmaster page update the site (see
# scripts/update-agent.sh and DEPLOY.md, "Updating from the Webmaster page"). Run once on the
# server, as the user that normally runs updatesite (it needs git access and the docker group):
#
#   ./scripts/install-update-agent.sh            # install or refresh
#   ./scripts/install-update-agent.sh --remove   # take it out again
#
# It installs two systemd units: a path unit that watches data/ops/request, and a one-shot
# service that runs update-agent.sh as you whenever a request appears.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
repo=$(pwd)
user=$(id -un)
group=$(id -gn)
home=$HOME

if [ "${1:-}" = "--remove" ]; then
  sudo systemctl disable --now elexprep-update.path 2>/dev/null || true
  sudo rm -f /etc/systemd/system/elexprep-update.path /etc/systemd/system/elexprep-update.service
  sudo systemctl daemon-reload
  rm -f data/ops/agent
  echo "The update agent is removed. The Webmaster page will say it isn't set up."
  exit 0
fi

if [ "$user" = root ]; then
  echo "Run this as the user that runs updatesite, not as root (it asks for sudo itself)." >&2
  exit 1
fi
if ! id -nG "$user" | grep -qw docker; then
  echo "$user isn't in the docker group, so it can't rebuild the site. Add it first:" >&2
  echo "  sudo usermod -aG docker $user   (then log out and back in)" >&2
  exit 1
fi

chmod +x scripts/update-agent.sh scripts/updatesite.sh scripts/maintenance.sh
# The app writes requests here as root from inside its container; the agent runs as you and
# must be able to read and remove them, so you own the folder.
sudo mkdir -p data/ops
sudo chown "$user:$group" data/ops
chmod 775 data/ops

sudo tee /etc/systemd/system/elexprep-update.service > /dev/null <<EOF
[Unit]
Description=ELEX Portal: run a site update asked for from the Webmaster page

[Service]
Type=oneshot
User=$user
Group=$group
WorkingDirectory=$repo
Environment=HOME=$home
ExecStart=$repo/scripts/update-agent.sh
TimeoutStartSec=45min
EOF

sudo tee /etc/systemd/system/elexprep-update.path > /dev/null <<EOF
[Unit]
Description=ELEX Portal: watch for site update requests from the Webmaster page

[Path]
PathExists=$repo/data/ops/request

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now elexprep-update.path
date -u +%Y-%m-%dT%H:%M:%SZ > data/ops/agent
echo "The update agent is installed. Open Webmaster > Site controls and press Check for updates."
