# Deploying ElexPrep with Docker

One container runs everything: the API, the web UI, and the SQLite database. All state
(database, logos, plots, generated print-job PDFs) lives in a single `data/` folder next to
`docker-compose.yml` — back that folder up and you have the whole app.

## Prerequisites

- Docker with Compose v2:
  - **Windows Server / Windows 11**: [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)
    (or Docker Engine in WSL2)
  - **Linux**: `docker` + `docker compose` from your distro or docker.com

## First deployment

```bash
git clone https://github.com/thomasshepley/ElexPrep.git
cd ElexPrep
docker compose up -d --build
```

Then open **http://localhost:4000** (or `http://<server-ip>:4000` from another machine —
allow TCP 4000 through the firewall).

The first visit shows the **create admin account** screen. Do this immediately — whoever
gets there first owns the instance.

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
git pull
docker compose up -d --build
```

Database migrations run automatically on container start. The `data/` folder is untouched
by rebuilds.

## Wiring up the real printer (later phase)

When ready, go to **Printer Settings** (admin) and switch from Dry run to one of:

- **Direct network (port 9100)** — the container sends PJL-wrapped PDFs straight to the
  printer's IP; needs the printer reachable from the Docker network (it is, by default —
  the container uses the host's LAN). Use *Test connection* to verify reachability. If the
  wrong tray fires, adjust each tray's PJL value in settings (bizhub/ineo family typically
  uses TRAY1 / TRAY2 / MANUALFEED).
- **Windows agent** — run `agent/elexprep-print-agent.mjs` on the machine with the ineo+
  3320i driver; see `agent/README.md`. Most reliable tray selection because it goes through
  the real driver.

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

## Notes

- **Ports**: change the left side of `4000:4000` in `docker-compose.yml` to expose a
  different port (e.g. `80:4000`).
- **HTTPS**: for LAN-only office use, plain HTTP is usually fine; if you expose it wider,
  put Caddy/nginx/Traefik in front and set `COOKIE_SECURE=true` in the environment so the
  session cookie is only sent over TLS. Leave it `false` (the default) for plain HTTP —
  a secure cookie is silently dropped by the browser otherwise, which breaks login.
- **Backups**: stop the container (`docker compose stop`), copy `data/`, start it again —
  or just copy `data/` live; SQLite single-writer usage here makes that low-risk. The server
  handles `docker compose stop`/`restart` (`SIGTERM`) by closing its DB connection cleanly
  before exiting, rather than being killed mid-request.
- **Without Docker**: `npm install && npm run build` then
  `cd server && npx prisma migrate deploy && node dist/index.js` — the server serves the
  built web UI itself; set `DATABASE_URL`, `UPLOADS_DIR`, and optionally `PORT`.
