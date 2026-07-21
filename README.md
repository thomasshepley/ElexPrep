# ElexPrep

A prep portal for Elex Lighting: turns a Wysiwyg patch CSV into printed labels (fixture,
truss/spike, cable, PAL case, rack), and is the home for job/plot management, Current RMS
integration, printer control, and prep-bay digital signage.

## What's built

- **CSV patch import** using a column mapping configured once in Settings → Import Mapping
  (the export format is normally identical between jobs, so imports don't re-prompt; upload a
  sample CSV on the settings page to pick columns from a list). Handles real Wysiwyg-style
  patch reports, not just clean flat CSVs: the real header row is auto-detected past any
  title/metadata preamble rows (image filename, job name, version, blank rows) and past
  "Type: X" sub-group marker rows mixed in with the data — verified against a real
  export (`Spot,Patch,Type,Position,Fixture Options,# Data,Unit`). A combined
  `"universe.address"` patch column (e.g. `"3.109"`) can be mapped as one field and is split
  automatically instead of requiring separate universe/address columns. Common column-name
  synonyms (Spot→address, Patch→universe.address, Position→location, ...) are auto-guessed
  from a sample file.
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
  - PAL case labels (job logo, color-coded stage location bar, case content/address range)
  - Rack labels (placeholder layout — no template was supplied for these yet)
- **Location colors** (Settings → Location Colors): maps a stage location string (Floor,
  Downstage, Mid Stage, Upstage, SR Dimmers, or any others you add) to a color for the PAL
  label's location bar, seeded on first run with Elex's house colors (green/red/orange/
  yellow/purple). Text color auto-switches black/white for contrast against whatever color
  is picked. A location with no rule prints with the original neutral dark bar.
  - **Per-job overrides** (Job Settings tab, on each job): jobs whose patch uses location
    names that don't match the house defaults (e.g. a Wysiwyg export with "Cube North",
    "Entrance Arch Top", "Stage Structure" instead of Floor/Downstage/...) can define their
    own bar colors without touching the shared defaults — a job-specific rule wins over a
    global one of the same name for that job only.
- **PAL label project image**: spans the full width of the top banner edge-to-edge (cover-fit
  with clipping, not letterboxed with margins), matching the physical template.
- **Visual print preview**: the Print Queue tab embeds the actual generated PDF (not a
  mockup) in the browser — same layout, colors, and logo the real print will have — that
  refreshes as you build the queue, edit quantities, or add ad hoc labels, before you commit
  to either confirm action.
- **Print preview & queue**: build labels from the current patch/cases, add ad hoc one-off labels
  (personal Peli cases, generic equipment, spare cable runs...), edit quantities, remove items,
  select what to confirm, then generate a combined print-ready PDF. A per-label copy cap (10)
  requires explicit override before a big batch is confirmed.
- **Everything is editable in place, everywhere** — no page requires deleting and re-adding a
  row to fix a typo:
  - Imported fixtures: every column (address, type, universes/addresses, mode, location),
    plus per-row delete, straight in the Patch Import table.
  - Cases: fixture type/label/location edit inline, delete individual rows, or add a manual
    case (e.g. a spare/hand case that didn't come from the patch) alongside the generated
    ones. Regenerating from the patch (destructive) warns first if it would wipe out manual
    edits or additions.
  - Fixture type rules: name and case label override edit inline.
  - Ad hoc labels: every content field edits inline (not just quantity) — location/title/
    subtitle for PAL, IP/subnet for sACN nodes, text for cable/tip labels, etc., matching
    whichever fields that label type uses.
  - Location colors: color edits inline via a color picker.
- **Jobs list**: search by name/venue, admin-only delete (cleans up the job's fixtures, cases,
  plots, print-job history, and every uploaded file — logo, plot PDFs, print-job PDFs — so
  nothing is left orphaned on disk or in the database).
- **Job logo upload**, shown on PAL labels and stored per job.
- **Settings area**: Case Rules, Location Colors, Import Mapping, Printer, Current RMS,
  Users, Permissions, and Activity Log all live under one **Settings** nav entry with its own
  sub-tabs, instead of cluttering the main nav.
- **Activity log** (Settings → Activity Log, admin-only): user attribution plus which job
  each action belongs to (linked, with a graceful "(deleted job)" fallback), search, and a
  per-job filter, for import/generate/confirm/print/login/user-management actions.
- **Accounts & permissions**: cookie-session login, first-run admin setup, three roles —
  ADMIN (everything), USER (normal prep work), SIGNAGE (view-only login for prep-bay TVs; the
  API rejects any write from it except ticking a pick-list item's prepped checkbox, see
  below). Per-user display name/password management under My Preferences.
  - **Granular permissions** (Settings → Permissions, admin-only): a handful of capabilities
    that default to ADMIN-only can be individually delegated to the USER role — creating
    jobs, deleting jobs, publishing/unpublishing jobs, viewing the activity log, and linking
    a job to a Current RMS opportunity. Everything is off until an admin turns it on, so
    introducing this never silently changes existing behavior.
- **Plot CAD PDFs**: upload per job, listed with an inline browser viewer (native PDF iframe),
  delete; PDF-only, 100 MB cap.
- **Prep-bay signage view** (`/signage`) — purely for prep, per job:
  - If the job is linked to Current RMS, shows its live **pick list** (opportunity items)
    instead of the local case list: each row shows the item, quantity, and Current RMS's own
    "Booked Out" status (read straight from its documented opportunity-item status codes),
    plus an ElexPrep-side **prepped** checkbox crew tap directly on the TV as they pull each
    item — the one deliberate, narrow exception to SIGNAGE's read-only rule. If not linked,
    falls back to the local case list grouped by fixture type (previous behavior).
  - **Change alerts**: when the sync poller detects the linked opportunity's pick list
    actually changed (not just any field — specifically added/removed/quantity-changed
    items), the screen flashes a full-screen, GitHub-diff-style alert — red for what was
    removed, green for what was added, orange for quantity changes — until dismissed.
  - SIGNAGE logins land here automatically and can't navigate elsewhere.

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
    live-fetched **pick list** ("opportunity items" in Current RMS's terms) with each item's
    quantity, Current RMS status, and ElexPrep prepped state, and a manual link/unlink
    control. The richer pick-list view (with the full-screen change alert) lives on the
    **signage screen** — see above.
  - **Change alerts**: the poller compares each synced opportunity's `updated_at` against
    what was cached before; if a linked job's opportunity actually changed, the job gets a
    dismissible alert badge (Jobs list, job tabs) and an activity log entry. If the pick list
    itself changed (not just some other field), it additionally raises the signage
    full-screen diff alert. This uses polling rather than Current RMS's webhooks,
    deliberately — webhooks need your server to be publicly reachable, which a home PC or
    office box behind NAT usually isn't; polling works over an outbound-only connection
    regardless of network setup.
  - The pick-list endpoint is the real, documented one — `GET
    /opportunities/{opportunity_id}/opportunity_items` — rather than a guessed flat
    `/opportunity_items?q[...]` filter (which 404s on a real account); "Booked Out" reads
    Current RMS's own opportunity-item status codes (`20` = Booked Out) directly.
- **Hardening**: unhandled errors (a bad ID in a URL, a duplicate name, etc.) return a
  proper JSON error response instead of hanging the request — Prisma's "not found" and
  "already exists" cases map to 404/409 specifically. The login endpoint is rate-limited
  (20 attempts / 15 min per IP) against password guessing, the session cookie's `secure`
  flag is configurable via `COOKIE_SECURE` for HTTPS deployments, passwords require a
  minimum length, uploads are capped and type-checked (job logo: 10MB/images only, plot
  PDF: 100MB/PDF only), and baseline security headers (via `helmet`) are set on every
  response — CSP and HSTS are deliberately left off (see `server/src/index.ts`) since they
  assume a same-origin/HTTPS setup this app doesn't force on you by default.

## What's deliberately deferred

- Live tray-value calibration against the physical ineo+ 3320i (PJL MEDIASOURCE values and
  SumatraPDF bin names are configurable in Printer Settings but need confirming on-site).
- A GitHub Pages remote-drafting companion site.
- Current RMS webhooks (inbound push notifications) as an alternative/supplement to polling,
  for setups where the server is genuinely internet-reachable.
- Rack labels use a placeholder layout — no physical template was supplied for these yet, so
  the geometry hasn't been measured against a real one like the other four label types.

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

Run `npm test` from the repo root for the automated test suite — unit tests for the core
business logic in `shared/src`: case-packing (`casePacking.ts`), CSV header-row detection and
combined universe.address parsing (`csvHeader.ts`), and the pick-list change diff
(`pickListDiff.ts`). Most other verification in this project has been manual (curl +
Playwright) rather than an exhaustive automated suite.

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
