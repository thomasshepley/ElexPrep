# Deploying ElexPrep on an AWS EC2 VPS

One container runs everything: the API, the web UI, and the SQLite database. A second,
small container (Caddy) sits in front of it and handles HTTPS. All state (database, logos,
plots, generated print-job PDFs) lives in a single `data/` folder next to
`docker-compose.yml` — back that folder up and you have the whole app.

## Prerequisites

- An AWS account.
- A free [Cloudflare](https://dash.cloudflare.com/sign-up) account, used only to manage DNS
  for the `portal.elex.lighting` subdomain — see "Go live" below for why, and for the
  OVH-specific steps to delegate just that subdomain without touching your main
  OVH-hosted `elex.lighting` site or email at all.
- Comfort with a terminal and SSH. Everything below is run over SSH on the instance itself.

## Launch the instance

1. **EC2 → Launch instance.**
   - **AMI**: Ubuntu Server 24.04 LTS (or 22.04 — either works).
   - **Instance type**: `t3.small` (2 vCPU, 2 GB RAM) is a comfortable default — this is a
     single lightweight Node/SQLite app, but the Docker build step below briefly needs more
     headroom than `t3.micro` reliably gives it.
   - **Storage**: bump the root EBS volume to at least **20 GB** (gp3) — the default 8 GB
     gets tight once Docker's build layers and a growing `data/` folder are on the same disk.
   - **Key pair**: create or pick one — you'll need the `.pem` file to SSH in.
   - **Security group**: create a new one with:
     | Type | Port | Source |
     |---|---|---|
     | SSH | 22 | **your own IP only** (`My IP` in the console), not `0.0.0.0/0` |
     | HTTP | 80 | `0.0.0.0/0` (needed for Let's Encrypt's certificate check) |
     | HTTPS | 443 | `0.0.0.0/0` |

     Nothing else needs to be open — port 4000 (the app itself) is never exposed to the
     security group at all; see "Go live" below for how it's still reachable for initial setup.
2. **Allocate an Elastic IP** (EC2 → Network & Security → Elastic IPs → Allocate) and
   **associate it with the new instance**. Without this, the instance's public IP changes on
   every stop/start, which would break DNS every time.
3. **SSH in**: `ssh -i your-key.pem ubuntu@<elastic-ip>`

## Install Docker

```bash
sudo apt update && sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER
```

Log out and back in (or run `newgrp docker`) so the group change takes effect, then confirm
with `docker compose version`.

## First deployment

```bash
git clone https://github.com/thomasshepley/ElexPrep.git
cd ElexPrep

# Required: the key that encrypts crew compliance documents, bank details, 2FA secrets, and
# the Current RMS/OneDrive API credentials at rest. Generate one and save it somewhere safe
# (a password manager, not just this .env file) — losing it makes anything already stored
# with it unrecoverable.
echo "CREW_DOC_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" > .env

docker compose up -d --build
```

This also starts the `caddy` service, but nothing public-facing is actually live yet — Caddy
won't get a certificate until DNS points at this box (see "Go live" below), and the app
container isn't published to the internet at all.

## Create the admin account (before DNS is wired up)

The first visit to the app shows the **create admin account** screen, with no invite or
confirmation step — whoever submits that form first owns the instance. Do this now, while
the app is reachable only via SSH, rather than after the public domain is live.

From your own machine (not the EC2 box), open an SSH tunnel to the app's loopback-only port:

```bash
ssh -i your-key.pem -L 4000:localhost:4000 ubuntu@<elastic-ip>
```

Leave that running and open **http://localhost:4000** in your browser — this is tunnelled
straight to the instance's `127.0.0.1:4000`, never touching the public internet. Create the
admin account here. You can close the tunnel afterwards; this step only needs doing once.

## Go live at portal.elex.lighting

Your main site (`elex.lighting`) stays exactly where it is, on OVH — nothing here touches
its hosting, its DNS, or its email. Cloudflare is not needed at all: add one DNS record
directly in OVH's own DNS zone, pointing just the `portal` subdomain at the EC2 box.
(Cloudflare's "Add a site" flow only accepts root/apex domains like `elex.lighting` — it
rejects a subdomain-only entry like `portal.elex.lighting` outright, so there's no working
Cloudflare-only-for-the-subdomain option here; see the note at the end if you want
Cloudflare's proxy/WAF anyway.)

1. **In OVH, add one A record.** Log into the [OVH Control Panel](https://www.ovh.com/manager/)
   → **Web Cloud → Domains** → `elex.lighting` → **DNS zone**, and add:
   ```
   Subdomain: portal        Type: A        Target: <your Elastic IP>
   ```
   (OVH's own field names may differ slightly, e.g. "sub-domain"/"target".) This is the only
   change made in OVH's DNS — the root domain, `www`, and any mail (MX) records already there
   are untouched.
2. **Confirm the Caddy config** (`deploy/caddy/Caddyfile`) points at the right domain. It
   already does by default: its site address is `portal.elex.lighting`. The same file also
   holds the maintenance page setup (see **Updating to a new version**).
3. **Wait for the record to propagate** — usually minutes, occasionally up to a few hours.
   Check with:
   ```bash
   dig portal.elex.lighting         # should resolve to the Elastic IP
   ```
   Once that resolves correctly, restart Caddy so it notices and requests the certificate:
   ```bash
   docker compose restart caddy
   ```
   Follow `docker compose logs -f caddy` the first time — it should report obtaining a
   certificate (via Let's Encrypt, automatically — no Cloudflare involved) within a few
   seconds of DNS resolving correctly.
4. **Confirm it's live**: open `https://portal.elex.lighting` from your phone on mobile data
   (not from the EC2 box itself) to prove it's really reachable over the public internet.
5. **Turn on `COOKIE_SECURE`** now that every login goes through HTTPS:
   ```bash
   echo "COOKIE_SECURE=true" >> .env
   docker compose up -d
   ```

From here, `updatesite` (see **Updating to a new version** below) keeps
`portal.elex.lighting` current — DNS, the Elastic IP, and the certificate don't
need touching again (Caddy renews automatically).

**If you actually want Cloudflare in front of this subdomain** (its proxy/CDN, WAF, or
analytics — not required for anything above to work), the only way is to move the *entire*
`elex.lighting` domain's nameservers to Cloudflare, not just `portal`. That means: before
touching anything, write down every record currently in OVH's DNS zone for `elex.lighting`
(the main site's A/CNAME records, and critically every mail record — MX, SPF, DKIM, DMARC —
since getting one of those wrong breaks email delivery, not just the website); recreate all
of them exactly in Cloudflare's DNS zone for `elex.lighting`; add the new `portal` A record
pointing at the Elastic IP there too; then change elex.lighting's nameservers at OVH to the
two Cloudflare gives you. Hosting doesn't move — the main site and mail keep running on
whatever servers they run on today — only DNS management moves to Cloudflare. This is real
extra work and risk for a benefit (Cloudflare's proxy features) this app doesn't need, so
it's not the recommended path; it's here only in case you want it for the main site too.

## Test checklist (everything except physical printing)

Printing defaults to **Dry run** mode, so you can exercise the whole flow with zero risk of
the printer firing:

1. **Setup** — create the admin account, then add a normal USER and a SIGNAGE user under
   *Users*.
2. **Settings → Import Mapping** — upload a sample Wysiwyg CSV export, map Address +
   Fixture Type (+ universe/address/mode/location as available), save.
3. **Case Rules** — add your fixture types and units-per-case (e.g. AstraBlade = 2,
   Reflecta = 3).
4. **Create a job**, upload a logo in Job Settings, and import a patch CSV — it should
   import with no mapping questions asked.
5. **Cases tab** — generate; check the groupings ("201 + 202", "401 - 403", "+ Spare").
6. **Labels tab** — add a cable label (tick DMX to see the narrow/cut-line variant), a
   personal Peli case PAL label, etc.
7. **Print Queue** — build from patch + cases, adjust quantities, then:
   - *Confirm & download PDF* → check every page against real label stock in a PDF viewer.
   - *Confirm & send to printer* → with Dry run active this creates per-tray print jobs
     marked SENT without printing; check the Print Jobs list shows the right tray for each
     label type.
8. **Plots tab** — upload a plot PDF, view it inline, open in a new tab.
9. **Signage** — visit `/signage` (or log in as the SIGNAGE user, which is forced there),
   pick the job, and check it on a TV-sized window.
10. **Activity Log** (admin) — confirm actions are attributed to the right users.
11. **Settings → Current RMS** (admin) — enter your subdomain + API key, *Test connection*,
    then *Sync now*. Confirm opportunities appear in the list, *Import as job* creates a
    private job, and the USER account can't see it until you tick **Public** in that job's
    Job Settings tab. Open the job's **Current RMS** tab and *Load pick list* to confirm it
    matches what's in Current RMS. Field names are a best-effort match to Current RMS's
    documented conventions — if the pick list or a summary field looks off against your
    real account, flag it and it's a quick fix.

When all of that passes, the release is steady everywhere except the physical print path.

## Updating to a new version

```bash
./scripts/updatesite.sh
```

This keeps the site up for nearly all of the update:

1. it pulls the latest code;
2. it builds the new version **while the current one keeps serving everyone** (the slow part);
3. it swaps the app container over. That takes a few seconds, and Caddy holds each request
   and retries it rather than failing it, so people see a short pause, not an error. If the
   swap ever takes longer than 30 seconds, they get the **Down for maintenance** page, which
   reloads by itself when the site is back;
4. it waits until the new version answers, applies any change to the Caddy config, and
   prints `Live on vX.Y.Z`.

Database migrations run automatically when the new container starts. The `data/` folder is
untouched by updates. Old images are cleaned up afterwards so the disk doesn't fill.

For a big update you'd rather nobody used the site during (a large database migration, say),
put the maintenance page up for the switch-over:

```bash
./scripts/updatesite.sh --maintenance
```

If the new version doesn't come up within three minutes, the script stops, prints the app's
recent logs, and (with `--maintenance`) leaves the maintenance page up until you fix it.

### Maintenance mode

For anything else that needs the site quiet (restoring a backup, server work), switch the
maintenance page on and off yourself:

```bash
./scripts/maintenance.sh on                  # everyone sees "Down for maintenance"
./scripts/maintenance.sh on "Back by 10pm"   # with a note on the page
./scripts/maintenance.sh status
./scripts/maintenance.sh off
```

It takes effect straight away, with no restart. Caddy serves the page itself, so it works
even while the app container is stopped or being rebuilt. Anyone with the site open is
moved onto it the next time their page talks to the server, and the page checks every 10
seconds and goes back to the site on its own once maintenance is off.

While it's on you can still reach the app directly over the SSH tunnel to `127.0.0.1:4000`
(see **Create the admin account**) to check a new version before reopening.

**Optional: one-word `updatesite` and `maintenance` commands.** Make them runnable from
any directory once:

```bash
chmod +x scripts/updatesite.sh scripts/maintenance.sh
sudo ln -sf "$(pwd)/scripts/updatesite.sh" /usr/local/bin/updatesite
sudo ln -sf "$(pwd)/scripts/maintenance.sh" /usr/local/bin/maintenance
```

**First update after this change:** the Caddy config moved from `./Caddyfile` to
`deploy/caddy/`. The first `updatesite` that includes it notices Docker Compose's new
settings and restarts Caddy once (a second or two). Nothing to do by hand, unless you had
edited `./Caddyfile` yourself, in which case copy your change into
`deploy/caddy/Caddyfile` first.

## Admin CLI

A small command-line tool runs operator actions directly against the live database and
uploads folder, for things no web UI should ever be able to do over HTTP (wiping the whole
site back to nothing, setting a password without knowing the old one). It ships inside the
same container as the app (`server/src/cli.ts`, built to `dist/cli.js`) - no separate
install.

Run it with:

```bash
docker compose exec elexprep node dist/cli.js <command> [args]
```

**Optional: a one-word `admin` command**, the same pattern as `updatesite` above:

```bash
chmod +x scripts/admin.sh
sudo ln -s "$(pwd)/scripts/admin.sh" /usr/local/bin/admin
```

From then on, e.g. `admin status` from any directory.

| Command | Does |
|---|---|
| `status` | Shows lockdown state, user counts by role, job count, active session count |
| `list-users` | Lists every account (username, role, display name, and must-change-password/2FA flags) |
| `add-user <user> [pass\|-] [role] [name]` | Creates an account directly. `role` is one of `ADMIN`/`USER`/`SIGNAGE`/`CREW` (default `USER`). Leave the password out (or pass `-`) to be prompted for it without it echoing or landing in shell history - run with `docker compose exec -it` for the prompt to work |
| `remove-user <user> --confirm` | Permanently deletes an account and everything attached to it (crew profile, documents, rate lines) |
| `set-password <user> [newPass\|-]` | Sets an account's password directly - for when someone's genuinely locked out and can't use self-service reset. Prompts when the password is left out, and signs the account out of every existing session |
| `force-password-reset <user>` | The account can still sign in with its current password, but the web app blocks everything else until it sets a new one |
| `set-role <user> <role>` | Changes an account's role |
| `revoke-sessions <user>` or `revoke-sessions --all` | Signs an account - or everyone - out everywhere immediately |
| `lockdown` | Development lockdown: only `ADMIN` accounts can sign in or use the API; every other account's sessions are revoked immediately. Use this for planned maintenance or if you suspect a compromise and want to freeze everything else while you investigate |
| `unlock` | Undoes `lockdown` |
| `full-lockdown` | Full lockdown: the strictest tier - blocks every account from signing in or using the API, `ADMIN` included; every other account's sessions are revoked immediately. Reserved for the rare case where even admin accounts shouldn't be trusted |
| `full-unlock` | Undoes `full-lockdown` |
| `reset-all-data --confirm-reset-everything` | **Deletes every row in every table and every uploaded file.** Leaves the site exactly as if freshly installed - visiting it afterwards shows the first-run "create the admin account" screen. There is no undo short of restoring a backup (see Notes below) |

`remove-user` and `reset-all-data` both refuse to run without their `--confirm`/
`--confirm-reset-everything` flag, so a bare mistyped command never destroys anything.

## Wiring up the real printer (later phase)

When ready, go to **Printer Settings** (admin) and switch from Dry run to one of:

- **Direct network (port 9100)** — the container sends PJL-wrapped PDFs straight to the
  printer's IP. This only works if the printer is reachable from the EC2 instance, which it
  almost certainly isn't for a printer sitting on your office LAN — this mode is really only
  practical when ElexPrep runs on the same network as the printer. For a VPS deployment, use
  the Windows agent instead.
- **Windows agent** — run `agent/elexprep-print-agent.mjs` on a Windows machine on the same
  network as the printer (see `agent/README.md`); it polls `https://portal.elex.lighting`
  over the internet for queued jobs and prints them through the real driver. This is the
  right choice for an AWS-hosted deployment, since the printer itself stays on your office
  network rather than needing to be reachable from the cloud.

Either way, do the first live test with a single one-page job per tray before trusting it
with a full batch.

## Troubleshooting

- **Container starts but logs show `Prisma failed to detect the libssl/openssl version` /
  `Could not parse schema engine response`** — you're on an older image built before this
  was fixed. Force a full rebuild so the fixed `Dockerfile` and `schema.prisma` are used:

  ```bash
  docker compose down
  docker compose build --no-cache
  docker compose up -d
  ```

- **`https://portal.elex.lighting` doesn't load / certificate errors** — check, in order:
  DNS actually resolves to the Elastic IP (`dig portal.elex.lighting`); the security group
  has 80 and 443 open to `0.0.0.0/0`; if using Cloudflare DNS, the record is set to DNS-only
  (grey cloud), not proxied; `docker compose logs caddy` for the actual ACME error.
- **Can't reach `http://localhost:4000` during initial setup** — confirm the SSH tunnel
  command is still running in its own terminal, and that you're opening the URL in a browser
  on your own machine, not on the EC2 box.
- **Elastic IP seems to have changed** — it won't, as long as it stays *associated* with the
  instance; this only happens if you explicitly release/reassign it, or replace the instance
  without re-associating it. Note it in EC2 → Elastic IPs if ever in doubt.

## Notes

- **CORS**: the API only ever needs to be called same-origin (Caddy proxies the public
  domain straight to the app; the Vite dev server proxies `/api` the same way locally), so
  cross-origin requests are rejected by default. If you ever genuinely need a different
  origin to call the API with credentials, set `CORS_ALLOWED_ORIGINS` to a comma-separated
  list of exact origins — never set it to `*` or reflect arbitrary origins, since this API is
  cookie-session-authenticated.
- **Backups**: stop the containers (`docker compose stop`), copy `data/`, start them again —
  or just copy `data/` live; SQLite single-writer usage here makes that low-risk. The server
  handles `docker compose stop`/`restart` (`SIGTERM`) by closing its DB connection cleanly
  before exiting, rather than being killed mid-request. On AWS, an EBS snapshot of the whole
  volume (EC2 → Elastic Block Store → Snapshots) is a convenient belt-and-braces addition —
  it captures everything on disk, not just `data/`, with no app-level steps needed.
- **Without Docker**: `npm install && npm run build` then
  `cd server && npx prisma migrate deploy && node dist/index.js` — the server serves the
  built web UI itself; set `DATABASE_URL`, `UPLOADS_DIR`, and optionally `PORT`. You'd still
  want a reverse proxy (Caddy, nginx) in front for TLS in this case.
