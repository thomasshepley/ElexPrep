# ElexPrep

A prep portal for Elex Lighting: turns a Wysiwyg patch CSV into printed labels (fixture,
truss/spike, cable, PAL case, rack), and is the planned home for job/plot management, Current
RMS integration, and prep-bay digital signage.

This is **phase 1** of a multi-phase build. Phase 1 delivers the core label engine end-to-end;
everything else in the original feature list is scoped for later phases (see below).

## What's built (phase 1)

- **CSV patch import** using a column mapping configured once in Settings → Import Mapping
  (the export format is normally identical between jobs, so imports don't re-prompt; upload a
  sample CSV on the settings page to pick columns from a list).
- **Case-packing algorithm**: groups fixtures into cases by a configurable "units per case" rule
  per fixture type, matching Elex's existing convention — pairs join as `"201 + 202"`, full
  groups of 3+ collapse to a range `"401 - 403"`, and a short leftover case fills the gap with
  `"+ Spare"` (e.g. `"303 + Spare"`). Verified against the real Wu_Lyf_PAL.pptx examples.
- **Four label types**, rendered as print-ready PDF at the exact physical geometry measured from
  Elex's existing templates (`Midge_Fixture_Labels.docx`, `Midge_Truss_Spikess.docx`,
  `Midge_Cable_Labels.docx`, `Wu_Lyf_PAL.pptx`):
  - Fixture labels (address + Main/Pixel universe+address + mode)
  - Truss/Spike labels (position number, "DO NOT TIP", sACN node IP/subnet) — 3 sub-types
    sharing one physical sheet layout
  - Cable labels, including the DMX variant narrowed by 1/3 with a cut line
  - PAL case labels (job logo, stage location bar, case content/address range)
  - Rack labels (placeholder layout — no template was supplied for these yet)
- **Print preview & queue**: build labels from the current patch/cases, add ad hoc one-off labels
  (personal Peli cases, generic equipment, spare cable runs...), edit quantities, remove items,
  select what to confirm, then generate a combined print-ready PDF. A per-label copy cap (10)
  requires explicit override before a big batch is confirmed.
- **Job logo upload**, shown on PAL labels and stored per job.
- **Case-packing rules and printer tray routing** as basic settings/reference screens.
- **Activity log** (append-only, admin-only) with user attribution for import/generate/confirm/
  print/login/user-management actions.
- **Accounts & permissions**: cookie-session login, first-run admin setup, three roles —
  ADMIN (everything incl. user management + activity log), USER (normal prep work), SIGNAGE
  (view-only login for prep-bay TVs; the API rejects any write from it). Per-user display
  name/password management under My Preferences.
- **Plot CAD PDFs**: upload per job, listed with an inline browser viewer (native PDF iframe),
  delete; PDF-only, 100 MB cap.
- **Prep-bay signage view** (`/signage`): chromeless fullscreen page for TV screens — pick a
  job, it shows the job name, logo, and case list grouped by fixture type, auto-refreshing
  every minute. SIGNAGE logins land here automatically and can't navigate elsewhere.

- **Printer connection** with three delivery methods (Printer Settings, admin-only):
  - *Dry run* (default): print jobs are created and tracked without touching hardware — safe
    for testing and Docker.
  - *Direct network (port 9100)*: the server streams PJL-wrapped PDF straight to the
    printer's IP with `MEDIASOURCE` tray selection — no Windows machine involved.
  - *Windows agent*: `agent/elexprep-print-agent.mjs` runs on the office machine with the
    ineo+ 3320i driver and prints via SumatraPDF with `bin=` tray selection — see
    `agent/README.md`.
  "Confirm & send to printer" splits the confirmed queue into one print job per label type,
  routed to its tray (PAL → Tray 1, Fixture/Truss/Spike → Tray 2, Cable/Other → Bypass, all
  configurable), with per-job status, retry, and cancel. "Confirm & download PDF" still
  produces the combined manual-print PDF.
- **Docker deployment** — single container (API + UI + SQLite), one `data/` volume for all
  state; see `DEPLOY.md` for setup and a full pre-release test checklist.
- **Current RMS integration** (Settings → Current RMS, admin-only):
  - Configure your subdomain + API key, test the connection, and sync — opportunities are
    cached locally (fast browsing, stays under Current RMS's 60-req/60s rate limit) and
    refreshed automatically on a configurable poll interval.
  - **Visibility model, exactly as requested**: only ADMIN can browse the raw opportunity
    list. Importing one creates a private Job; an admin then marks it **Public** (Job
    Settings) for USER/SIGNAGE to see it. Job lifecycle (create/delete/publish) is
    admin-only, same as printer/user settings — USER operates on what's been published.
  - A job's **Current RMS tab** shows the linked opportunity's status/dates/customer, a
    live-fetched **pick list** ("opportunity items" in Current RMS's terms), and a manual
    link/unlink control.
  - **Change alerts**: the poller compares each synced opportunity's `updated_at` against
    what was cached before; if a linked job's opportunity actually changed, the job gets a
    dismissible alert badge (Jobs list, job tabs) and an activity log entry. This uses
    polling rather than Current RMS's webhooks, deliberately — webhooks need your server to
    be publicly reachable, which a home PC or office box behind NAT usually isn't; polling
    works over an outbound-only connection regardless of network setup.
  - Current RMS's exact field names for opportunities/opportunity items aren't fully
    published; extraction follows their documented conventions and degrades gracefully
    (raw API responses are always cached alongside the parsed fields), but is worth a
    sanity check against your real account after entering the API key.

## What's deliberately deferred

- Live tray-value calibration against the physical ineo+ 3320i (PJL MEDIASOURCE values and
  SumatraPDF bin names are configurable in Printer Settings but need confirming on-site).
- A GitHub Pages remote-drafting companion site.
- Current RMS webhooks (inbound push notifications) as an alternative/supplement to polling,
  for setups where the server is genuinely internet-reachable.

## Repo layout

```
shared/   TS types, label geometry constants (measured from the real templates), case-packing algorithm
server/   Express + Prisma (SQLite) API, PDF generation (pdf-lib)
web/      Vite + React UI
```

## Running locally

```bash
npm install
npm run build --workspace shared

# server
cd server
cp .env.example .env      # if not already present
npx prisma migrate dev
npm run dev                # http://localhost:4000

# web (separate terminal)
cd web
npm run dev                # http://localhost:5173, proxies /api to :4000
```

Swapping SQLite for Postgres later is just an env var change (`DATABASE_URL`) plus rerunning
`prisma migrate deploy` — nothing in the app code is SQLite-specific (enums are stored as plain
strings for SQLite compatibility and validated at the application layer).

## Label geometry

`shared/src/labelGeometry.ts` holds the physical sheet layouts (page size, cell positions/sizes)
read directly out of Elex's existing Word/PowerPoint templates rather than guessed. Real printers
and label stock always need a few mm of fine-tuning — treat these as the calibrated starting
point and expect to add a small per-template X/Y nudge in settings once printing on the actual
ineo+ 3320i with real label stock.

## Fixture type rules

Case-packing rules (`Case Rules` in the nav) are keyed on the fixture type string exactly as it
appears in the imported CSV — e.g. adding `AstraBlade` with `unitsPerCase: 2` reproduces Elex's
existing convention. A fixture type with no rule defaults to one unit per case (i.e. it gets its
own case label per fixture).
