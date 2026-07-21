# ElexPrep

A prep portal for Elex Lighting: turns a Wysiwyg patch CSV into printed labels (fixture,
truss/spike, cable, PAL case, rack), and is the planned home for job/plot management, Current
RMS integration, and prep-bay digital signage.

This is **phase 1** of a multi-phase build. Phase 1 delivers the core label engine end-to-end;
everything else in the original feature list is scoped for later phases (see below).

## What's built (phase 1)

- **CSV patch import** with a column-mapping wizard (no fixed Wysiwyg export format assumed —
  you map whatever columns your export has onto address/type/universe/address/mode/etc).
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
- **Activity log** (append-only) for import/generate/confirm/print actions.

## What's deliberately deferred

Per the scope agreed for phase 1, these are **not** built yet:

- Accounts, login, and the full permissions system (digital-signage user, per-user prefs, etc.)
- Current RMS integration (linking a job to an opportunity, pulling pick lists, change alerts) —
  the job record has a placeholder field for the opportunity ID only.
- Plot CAD PDF upload/viewer for jobs.
- Prep-bay digital signage view.
- Real printer/tray automation. The app generates correct, print-ready PDFs and shows the tray
  each label type should use (Tray 1 = PAL, Tray 2 = Fixture/Truss/Spike, Bypass = Cable/Other,
  per the Develop ineo+ 3320i setup) — but actually pushing a PDF to a specific tray needs to run
  on the Windows machine with the driver installed. The cleanest path is a small Windows-side
  helper (e.g. a .NET `PrintDocument` call setting `PaperSource` from the tray name, or
  SumatraPDF's `-print-to`/`-print-settings` if the driver exposes bin selection through it) that
  this server calls out to once it's running on-site. That's a separate, hardware-specific piece
  of work best done against the real printer.
- A GitHub Pages remote-drafting companion site.

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
