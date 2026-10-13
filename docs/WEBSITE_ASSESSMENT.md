# ElexPrep website assessment

Assessed 13 Oct 2026 against `claude/website-assessment-emcvoo` (v1.3.0). This document is written
to be handed to an implementing agent. Every finding names the file and, where useful, the line, and
is tagged **Verified** (reproduced in a running build or confirmed in source by the assessor) or
**Reported** (found by a code reviewer, plausible, not independently reproduced).

How it was assessed: full `npm install`, `npm test` (10/10 pass), `oxlint` (1 error, 12 warnings),
`tsc -b` (clean), `vite build` (succeeds), then the real server + built UI run locally with a seeded
job (50 fixtures, 23 cases, 4 crew, 4 days, 4 schedule entries, contacts, a discussion) and
Playwright screenshots of every screen as ADMIN, USER and CREW at 1440 px and 390 px, dark and light.
Three parallel code reviews covered the settings pages, the job sub-panels, and the server.

---

## 1. Executive summary

**What is already good.** The design-token system in `web/src/index.css` is coherent (contrast-
checked accent/danger fills, light/dark via one attribute, reduced-motion respected). Login, Apply,
Onboard and Preferences are the best-built screens: labelled fields, busy states, flex-basis field
widths. The schedule tab (day blocks + hour timeline + drag crew) is genuinely useful. Session
cookies are `httpOnly`/`SameSite=Lax`, agent auth is timing-safe, crew portal reads re-check
assignment every time, 2FA has attempt caps. Case packing and CSV header detection have real tests.

**What needs doing, in priority order.**

| # | Area | Why it matters |
|---|------|----------------|
| 1 | **Uploads can carry stored XSS** (SVG/HTML served inline, no CSP, one upload path is anonymous) | Any applicant or crew member can run script in an admin's session |
| 2 | **Job sub-resources ignore `isPublic`, any USER can edit any job, agent print token readable by every role** | Permission model only holds on two endpoints |
| 3 | **Dashboard and crew schedule ignore a job's own dates and hide non-RMS jobs** | The calendar is empty for a job whose dates are set; crew see "No date set yet" |
| 4 | **Phone layout breaks on every page with a secondary nav** (job detail, settings) | Horizontal scroll, only the first tab visible |
| 5 | **No way to create a job without Current RMS** | The product is unusable until RMS is wired up; also blocks testing |
| 6 | **~34 native `confirm()/prompt()/alert()` dialogs, ~20 silent-failure mutations, 3 different "saved" conventions** | Feels unfinished and loses data silently |
| 7 | **Default location colours are seeded twice on first boot** | Every fresh install shows duplicate Spare/Rigging/Everywhere rows |
| 8 | **No 404 route, no error boundary, no per-page title, no code splitting** (612 kB JS + 2.2 MB PDF worker on first load) | Blank screens on bad URLs or a render error |
| 9 | **Signage shows only a red error for an RMS-linked job when RMS is off** | The TV in the prep bay goes dark instead of falling back to the local case list |
| 10 | **Inline-edit tables everywhere** (fixtures, cases, contacts, rules, colours) with no save feedback and clipped last columns | Hard to scan, hard to trust, unusable on a phone |

---

## 2. Security (do these first)

All **Verified** unless marked.

### 2.1 Stored XSS through uploads — HIGH
- `server/src/routes/auth.ts:27-37` avatar filter only checks `mimetype.startsWith('image/')` and
  keeps the client's extension; `auth.ts:215-219` serves it with `res.sendFile` to any signed-in
  user. An `x.svg` with `<script>` executes in the viewer's origin. CSP is off (`index.ts:64`).
- Same pattern: job logos `routes/jobs.ts:16-26` / `:154-162`; job documents
  `routes/jobDocuments.ts:25-28` / `:58-60` and `routes/crewPortal.ts:331-333` (served inline with
  the client's stored mime type); crew compliance docs `crewDocumentsStorage.ts:51-53`.
- The crew application upload `routes/crewApplications.ts:22-28,73-110` is **unauthenticated**, so an
  anonymous applicant can plant the file an admin then opens.
- **Fix:** sniff magic bytes (`file-type`), allow-list `png|jpeg|gif|webp` and `application/pdf`,
  reject SVG, store a server-chosen extension, serve with `Content-Disposition: attachment` (or at
  minimum `X-Content-Type-Options: nosniff` plus a `sandbox` CSP on the upload routes). Never echo the
  client mime type.

### 2.2 Agent print token readable by every role — HIGH
- `routes/printJobs.ts:61-63` `GET /api/printer-settings` has no `requireRole`; the response
  includes `agent.token` (`printing/printerSettings.ts:21`). USER/SIGNAGE/CREW can read it and act
  as the print agent (claim jobs, download any print PDF).
- **Fix:** `requireRole('ADMIN')` on the GET, and strip `agent.token` from any non-admin response
  (the print-queue panel only needs `trayMap` and `method`).

### 2.3 Unbounded public multipart intake — HIGH
- `POST /api/crew-applications` and `POST /api/onboarding` accept 2 × 15 MB into memory storage with
  no rate limit, then write to disk and notify every admin. Memory/disk/notification-spam DoS from
  the internet.
- **Fix:** `express-rate-limit` per IP on both, cap `fieldSize`, stream to disk.

### 2.4 Visibility model only enforced on two endpoints — MEDIUM
- `routes/jobs.ts:34,47` filter by `isPublic`; nothing else does. Documents, plots, contacts
  (phone/email PII), discussion, print queue, schedule, days, crew are readable by any USER for a
  private job (`jobDocuments.ts:33-61`, `plots.ts:28-55`, `jobContacts.ts:13-19`,
  `jobDiscussion.ts:47-58`, `printQueue.ts:87-222`). Ids leak via notifications
  (`notifications.ts:95-103` notifies all USERs about private-job discussion posts).
- **Fix:** one `requireJobVisible(req, jobId)` helper (404 unless ADMIN or `isPublic`) applied in
  every `/:jobId/*` handler; filter notification recipients by visibility.

### 2.5 Any USER can modify any job — MEDIUM
- `routes/jobs.ts:51-85` only gates `isPublic`/`crewFeatures`; name, venue, description, address,
  dates are writable by USER. Logo upload/delete (`jobs.ts:128-152`) and plot upload/delete
  (`plots.ts:36-64`) have no role check at all while `jobDocuments` is admin-only.
- **Fix:** admin-only or a dedicated permission (`editJobs`) in `permissions.ts`.

### 2.6 Other verified / reported server issues
- `mustChangePassword` is enforced only in the SPA (`App.tsx:17`); `auth.ts:111-158` lets a
  forced-reset account call every API. **Verified.** Fix in `authMiddleware`.
- Avatar upload writes to disk before the 401 check (`auth.ts:193-195`); orphan files. **Reported.**
- Password changes never revoke other sessions (`routes/auth.ts:182-190`, `users.ts:48-55`,
  `crew.ts:221-229`); sessions are 30-day fixed with no purge. **Reported.**
- Print-queue item ops not scoped to `:jobId` (`printQueue.ts:167-201`). **Reported.**
- `bcrypt.hashSync/compareSync` on unauthenticated paths (`auth.ts:33,37`, `twoFactor.ts:36,52`)
  block the event loop. Use async. **Reported.**
- No schema validation anywhere; non-string bodies produce 500s (`routes/auth.ts:139`,
  `jobs.ts:76-77`, `crewPortal.ts:456` etc.). Add zod per route. **Reported.**
- `cli.ts` bypasses the audit log and takes passwords on argv. **Reported.**
- `print-queue/build` is N+1 and non-atomic (`printQueue.ts:25-81`). Use `$transaction`. **Reported.**
- Low: username timing enumeration (`auth.ts:90-97`), first-run setup race (`auth.ts:65-85`),
  backup-code double-use race (`twoFactor.ts:48-57`), onboarding tokens never expire
  (`onboarding.ts:87-89`), missing indexes on `ActivityLogEntry(jobId, createdAt)`, `PrintJob(jobId)`,
  `Session(expiresAt)`.

---

## 3. Functional bugs

### 3.1 Dates and the dashboard — Verified
- `routes/dashboard.ts:43-44` and `routes/crewPortal.ts:213-214` take `startsAt/endsAt` from the
  Current RMS opportunity only. `Job.startsAt/endsAt` (documented in Job Settings as the override
  that "falls back to the opportunity's dates") is ignored, while `crewPortal.ts:271-272` (the crew
  job page) does use it. Result: a job with dates set shows **"No date set"** on the dashboard,
  **"No date set yet"** on the crew schedule, and nothing on either calendar.
- `dashboard.ts:17` also filters `currentRmsOpportunityId: { not: null }`, so a job that is not
  RMS-linked never appears on the dashboard at all.
- **Fix:** `job.startsAt ?? opp?.startsAt` in both places; drop the RMS-only filter (keep the
  "value" column null for unlinked jobs).

### 3.2 Default location colours seeded twice — Verified
- `index.ts` calls `seedDefaultLocationColorsIfEmpty()` and
  `seedNewDefaultLocationColorsIfMissing([...])` concurrently at boot. On an empty table both see
  "missing" and both insert, so a fresh install has two of each of Spare, Rigging and Everywhere
  (11 rows instead of 8; visible on Settings → Location Colors).
- **Fix:** `await` the first before the second, or merge into one idempotent seed keyed on
  location; add a unique index on `(jobId, location)`.

### 3.3 Secondary nav breaks phone layout — Verified
- `index.css:690-703` gives `.secondary-nav a, button { width: 100% }`; the `@media (max-width:
  760px)` block switches the nav to a horizontal row but never resets the width, so each tab is
  viewport-wide (8 tabs × 287 px = 2665 px). Document scroll width on `/jobs/:id` at 390 px is
  1089 px; on `/settings/users` it is 521 px. Only "Prep" is visible, the rest scroll off-screen.
- **Fix:** in the media query set `width: auto; flex: 0 0 auto` and give `.secondary-nav` a
  scroll-snap or overflow fade.

### 3.4 Hidden file inputs cause horizontal scroll — Verified
- `.file-input-native` (`index.css:303-312`) is `position: absolute` but `.file-input` is not
  `position: relative`, so the 1 px input lands at the page's far right. On `/apply` at 1440 px the
  document is 2254 px wide and scrolls sideways.
- **Fix:** add `position: relative` to `.file-input` (or `left: 0; top: 0` on the native input).

### 3.5 No 404, no error boundary — Verified
- `/anything-unknown` renders a blank dark page and logs "No routes matched location". There is no
  `<Route path="*">`, no `ErrorBoundary` anywhere in `web/src`, and `document.title` is never set.
- **Fix:** a `NotFoundPage` with a link back; an app-level error boundary with "Reload"; set the
  tab title per page (`Jobs · ELEX`, `Wu-Lyf Arena Tour · ELEX`).

### 3.6 Signage for an RMS-linked job with RMS disabled — Verified
- `SignagePage.tsx` branches on `linked = Boolean(job.currentRmsOpportunityId)` and, when the pick
  list call fails, shows only "Could not load pick list: Current RMS integration is disabled" in red.
  The local case list fallback is never used.
- **Fix:** on pick-list failure (or when integration is disabled) fall back to the case list and
  show a small muted banner instead of a page-level error.

### 3.7 Inline-edit tables clip and truncate — Verified from screenshots
- Patch Import: `width: 60` number inputs truncate 3-digit addresses ("20:" for 203) and `width: 55`
  truncates 3-digit DMX addresses ("12'" for 121) because the spinner eats the width
  (`PatchImportPanel.tsx` fixture rows). Make the columns at least 5 ch and hide spinners.
- Cases and Contacts tables: the last column (Delete / WhatsApp) is clipped at the panel edge
  ("Dele", "What") because the row is wider than the panel and the table is not scrolling as a unit.
  Give tables a `.table-scroll` wrapper and let the action column shrink to an icon.
- Case label `513 + 514 + Spare + Spare + Spare + Spare` for a 6-per-case leftover: confirm this is
  what the physical label should say. `513 + 514 + 4× Spare` reads better; see §6.

### 3.8 React correctness (oxlint error) — Verified
- `web/src/components/CrewMarginPanel.tsx:22` returns `null` for non-admins **before**
  `useEffect` at `:34` — rules-of-hooks violation. Split into a gate component and an inner
  component.

### 3.9 Reported client bugs worth fixing in the same pass
- `SkillPicker.tsx:176-178` / `CertificationPicker.tsx:227-229`: the "Other (comma separated)" input
  is re-derived from parsed value on each keystroke, so a trailing comma is stripped and a second
  item can never be typed. Keep raw text in local state, normalise on blur.
- `RateCardEditor.tsx:99-110`: general rate saves on blur **and** on Save click → two creates →
  duplicate "General day rate" lines.
- `OneDriveFilesPanel.tsx:206,232-240`: breadcrumbs start as `['Project folder']` and the first
  browse appends another, so every share path is stored as `Project folder/Project folder/<name>`.
- `InlinePdfViewer.tsx:79-128`: `PDFDocumentProxy` never `destroy()`ed, `RenderTask` never
  cancelled (two zoom clicks → pdf.js "same canvas" error), no DPR scaling (blurry on phones), no
  `.catch` on the dynamic import (spinner forever).
- `DayTimeline.tsx:192-194`: an entry ending after midnight (22:00–01:00) renders as 30 minutes.
- `JobDiscussionThread.tsx:48-57`: every 15 s poll replaces the array and scrolls to bottom, yanking
  a reader who scrolled up.
- `JobCrewPanel.tsx:158`: Role is a controlled input that PUTs + refreshes on every keystroke;
  responses race and overwrite typing.
- `LocationColorsPage.tsx:98-134`, `JobLocationColorsPanel.tsx:463-469`: `onChange` on
  `<input type="color">` fires continuously while dragging → a PUT per mouse move.
- `LabelTypeForm.tsx:19,144`, `LabelTypeSection.tsx:359,428,440`, `FixtureTypeRulesPage.tsx:91`:
  `Number('')` → `0` is submitted when a field is cleared.
- `FileInput.tsx:349-355`: native input value never reset, so the same file can't be re-picked after
  an error; the filename stays shown after upload.
- `PasswordInput.tsx:315`: `tabIndex={-1}` on the eye button hides it from keyboard users.
- `BankDetailsReveal.tsx:370`: revealed details go stale after a save; no "Hide" either.
- `UsersPage.tsx:160`: an admin can demote their own account (delete already guards self).
- `CrewApplicationsPage.tsx:211`: approving a checked application leaves its id in `selected`.
- `OnboardingPage.tsx:47-53`: "Copied ✓" shows even when the clipboard write failed.
- `WhatsAppButton.tsx:45-50`: `+44 (0)7700…` keeps the trunk zero → wrong `wa.me` number.
- `LocationLinks.tsx:34`: "Look up on What3Words" links to the W3W homepage, not the address.
- Blank-on-error components: `CurrentRmsPanel.tsx:135`, `OneDriveFilesPanel.tsx:311`,
  `PrinterSettingsPage.tsx:34`, `CurrentRmsSettingsPage.tsx:122`, `OneDriveSettingsPage.tsx:75`,
  `CrewPortalSettingsPage.tsx:174`, `TwoFactorPanel.tsx:108`, `LabelTypeSection.tsx:171` all
  `return null` before the error can render.

---

## 4. UX and design, screen by screen

### Shell and navigation
- Sidebar is fine on desktop. The brand mark is a plain blue gradient square while `favicon.svg` is a
  purple/cyan lightning bolt. Pick one identity and use it in the sidebar, login card and favicon
  (see §6).
- No skip link, no `aria-live` region anywhere (toasts are not announced), no per-page title.
- On phones the sidebar collapses to icons with no labels or tooltips; a bottom tab bar would suit
  crew on site better than a 76 px rail.
- The Notifications/Dark/Sign out stack at the bottom takes three full-width buttons; a single row of
  icon buttons would free vertical space.

### Dashboard
- Empty of information even with data because of §3.1. Once fixed, also add: "this week" strip
  (today's and tomorrow's calls with crew), count of jobs by prep stage, and the print-jobs that
  failed. "1 active order · £0.00 total value" reads as broken when RMS isn't connected; hide the
  value when every row is null.
- The Active orders table on a 390 px phone wraps the job name one word per line and the "No date
  set" chip into a blob. Render as cards below 760 px.

### Jobs list
- Cards show name, venue, public chip only. Add dates, crew count, prep progress
  (patch → cases → labels → printed) and sort by upcoming start, not creation order (the seeded
  "Corporate Awards" with no dates sorts first).
- **Delete** is the most prominent control on every card. Move it into the job's settings tab or a
  kebab menu; keep the card a single click target.
- No filter for Public/Private or past/upcoming; no archive concept so the grid will grow forever.

### Job detail — Prep
- Four panels stack before the data (OneDrive scan, CSV upload, "Ready to import", fixtures). For a
  job with fixtures already imported, the fixtures table should lead and import should be a
  secondary action ("Re-import").
- The imported-fixtures table is 50 rows of 9 inputs each: slow to scan and heavy to render. Show
  read-only text, edit on click (or a row edit mode), and keep the inline inputs only in a focused
  row. Add a sticky header and the group headings as collapsible sections.
- The "Every field is editable in place (click and type, saves on blur)" line appears five times
  across the app and there is no per-row saved/failed indicator to back the promise. Replace with
  a brief inline "Saved" flash or a toast on blur.
- Stages bar is good; "+ Split into stages" reads as a primary action for something most jobs
  never use. Demote to a text link.

### Job detail — Print Queue
- The page is ~7300 px tall for one job: every queue item is a row with its own preview thumbnail
  column. Put the preview in a single sticky side panel that follows the selected row, and make rows
  compact. Add a summary line ("50 fixture · 24 PAL · 1 cable · 2 sACN → 9 sheets, Tray 1/2/Bypass")
  next to the confirm buttons.
- Section headings print raw enums (`TRUSS_SPIKE_SACN`); `LabelTypeForm.TYPE_LABELS` already has the
  human names.
- "Confirm & send to printer" sits above the items it will send; move the action bar to the bottom
  or make it sticky.

### Job detail — Schedule
- Strongest screen. Issues: times are 12-hour on blocks ("11:00 AM – 05:00 PM") and 24-hour on the
  axis (13:00); pick 24-hour throughout (industry norm on call sheets). The hour axis is fixed
  06:00–23:00 so a show that ends at 01:00 is cut off. The table under the timeline duplicates it;
  replace with edit/delete on the blocks. The colour swatches have no names or legend. Crew
  assignment is drag-only (no keyboard, no tap on mobile); add an "Assign…" button on each block.
  The "Add schedule entry" form sits above the timeline; put it in a modal from a "+ Entry" button.

### Job detail — Crew, Contacts, Documents, Plots, Discussion, Current RMS
- Crew: solid green WhatsApp buttons on every row dominate the table; use an icon button. Zero-rate
  checkbox label wraps awkwardly. Crew margin shows "Current RMS integration is disabled" as a red
  error; it is an expected state and should be a muted note.
- Contacts: seven inline inputs per row; render contacts as cards (name, role, phone with tap-to-
  call, email, WhatsApp) with an edit affordance.
- Documents: no empty state ("No documents yet") and no list heading when empty.
- Plots: three stacked panels where two are explanatory. Hide the OneDrive panel when OneDrive
  isn't configured (one line "Connect OneDrive in Settings to auto-detect plots" is enough).
- Discussion: panel has no title; "Lock discussion" floats alone top-right. Compose is a single-line
  input (Enter sends, no multi-line). Timestamp is 12-hour.
- Current RMS: when the integration is off, the panel offers "Unlink" and "Refresh" around a red
  error. Show an informative empty state and hide actions that can't work.

### Job Settings
- One very long panel: form, visibility, logos, crew features, location colours. The labels here are
  plain `<label>Name<br/>` while every other form uses `.field` uppercase labels, so it looks like
  a different app. Two different "Save" buttons (primary and secondary) in the same panel. The map
  preview is a flat white rectangle in dark mode (no background, no loading state). Split into
  cards: Details, Visibility, Logos, Crew portal, Location colours, Danger zone (delete job lives
  here).
- Dates use `datetime-local`, which renders US order (`10/15/2026, 07:00 AM`) depending on browser
  locale. Consider explicit en-GB formatting in display and a date + time pair for input.

### Settings area
- Thirteen sub-sections in one flat list. Group them: **Prep** (Case Rules, Location Colours,
  Import Mapping, Printer), **Integrations** (Current RMS, OneDrive), **People** (Users, Crew,
  Applications, Onboarding, Crew Portal), **System** (Activity Log), and move My Preferences to the
  user menu in the sidebar.
- Case Rules, Location Colours, Users, Crew, Activity Log tables sit outside `.panel`, so they have
  no horizontal-scroll container on phones.
- Location Colours: colour inputs have no labels; the duplicate rows from §3.2 are visible.
- Printer: label-type → tray list prints raw enums. Page is one implicit form with the Save button
  outside any `<form>` (no Enter-to-save, no validation).
- Crew: the "Add crew member" form comes before the roster; list first, add via a button. Three
  action buttons per row (Details / Reset password / Delete) plus a toggle: fold into a row menu.
- Activity Log: details show raw cuids (`Job Day → Assign Crew cmv722s250…`) and raw ISO strings;
  resolve to names ("Sam Rivers → Thu 15 Oct"). The IP column is admin-debug noise; hide by default.
  Loads everything in one request with no pagination.
- Current RMS / OneDrive / Printer use three different label styles.

### Login, Apply, Onboard
- Login card is good. Apply is good structurally but asks an anonymous applicant for **bank
  details, day rate and address** up front. Collect bank details only at onboarding-complete (the
  invite is authenticated) and make the public form short: name, email, phone, skills, right to
  work, documents optional. This also shrinks the unauthenticated attack surface in §2.3.
- Onboard-complete returns to `/login` with no "account created" message.

### Crew portal
- Schedule: both jobs say "No date set yet" (§3.1). Once fixed, lead with a "Your next call" hero:
  job, date, call time, venue, map link, who else is on.
- Job page: the Who/What/When/Where row is good. The Why card is a long grid of subsections; on a
  390 px phone it is a 4000 px scroll. Make Week overview, Day schedule, CAD, Kit list, Documents,
  Contacts collapsible with the schedule open by default. The white map box repeats.
- Account: the "BANK DETAILS" heading renders twice (`CrewAccountPage.tsx:369-372` plus
  `BankDetailsForm.tsx:334`). Notification toggles include admin-only categories ("New crew
  applications", "New onboarding requests") that mean nothing to crew; filter by role.
  Two sources of truth for a day rate (profile `dayRate` vs rate lines) — the roster shows 250 but
  the rate card shows an empty field.
- Make the crew portal installable (web app manifest, `theme-color`, apple-touch-icon) so crew can
  add it to a home screen; add an `.ics` link per job so the dates land in their phone calendar.

### Signage
- Beyond §3.6: add a clock, a "last refreshed" indicator, a progress bar for prepped / total, and
  auto-pick the job that is next by date when the screen boots (persist the chosen job in
  `localStorage` so a TV reboot doesn't need a mouse).

### Light theme
- Works well; no contrast problems spotted. The `.auth-page` stays dark by design, fine.

---

## 5. Code quality and consistency

- **492** `style={{ … }}` occurrences in `web/src`. Most are widths (`width: 60`, `maxWidth:
  '32rem'`, `flex: '1 1 14rem'`), stacks (`display:flex; flexDirection:column; gap`) and row
  alignment. Add a handful of utility classes (`.stack`, `.row-end`, `.field-sm/.md/.lg`,
  `.table-scroll`, `.stat`) and delete the inline styles as files are touched.
- **34** `window.confirm/prompt/alert` calls while `Modal` exists. Build `useConfirm()`,
  `PromptModal` (textarea note) and `ResetPasswordModal` once; use `showToast` for success.
- **Silent mutations:** ~20 handlers `await api.x()` with no try/catch and no busy flag. A
  `useMutation`-style helper (busy state + error toast) applied everywhere fixes this uniformly.
- **Load → `if (!data) return null`** hides errors in at least eight components (list in §3.9). A
  `useLoad(fetcher)` hook returning `{ data, error, loading }` plus a `<LoadState>` component.
- **Fetch races:** every panel's `useEffect` calls `refresh()` with an eslint-disable and no
  cancellation, so a fast `jobId` change can show stale data; the same hook solves this.
- **Duplicated helpers:** `toDatetimeLocal` ×3, day-label formatting ×4, `formatTime` ×2,
  `formatMoney` local, `contrastingText` vs the shared one, `SCHEDULE_COLOR_PRESETS` vs
  `CREW_COLOR_PALETTE`, crew-chip markup vs `CrewSwatch`, `DOCUMENT_SLOTS` ×2, `statusChipClass` ×2,
  change-password form ×3, avatar block ×2, crew profile fields ×4, 24 raw
  `new Date(x).toLocaleString()` call sites. Create `web/src/utils/format.ts` and a few shared
  components.
- **Label conventions:** `.field` + `htmlFor` (good), raw `<label>Text<br/>` (Printer, Current RMS,
  OneDrive, Job Settings), placeholder-only (Users add form, Case Rules, Location Colours, Activity
  Log, Import Mapping). Convert all to `.field`.
- **Success feedback:** sticky "Saved ✓" text, `setMessage('Saved.')`, and `showToast` are all in
  use. Standardise on toast.
- **Accessibility:** unlabeled inline-edit inputs, colour inputs, selects and search boxes across
  ~10 files; drag-only interactions (crew assignment, queue reorder, template editor) with
  `PointerSensor` only; emoji file/folder icons in `OneDriveFilesPanel`; `role="button"` card with
  nested buttons in `DayBlocksColumn`.
- **`api/client.ts`** is 1229 lines, ~45 domains plus ~550 lines of interfaces. Split by domain
  (`api/jobs.ts`, `api/printQueue.ts`, …) sharing `request()`, types in `api/types.ts`. No caching
  or de-duplication: the Plots tab fetches `jobOneDrive.get` and `plots.list` three times on mount
  (six under StrictMode).
- **Bundle:** one 612 kB JS chunk plus a 2.2 MB pdf.js worker. Lazy-load the PDF viewer, Signage,
  Settings and the crew portal with `React.lazy`.
- **Tests:** none in `web/`. Add a Playwright smoke (login → job → prep → print queue, plus the
  crew portal) now that the seeding script pattern exists; add unit tests for `casePacking` edge
  cases around spares.
- **oxlint:** fix the one error (§3.8) and either address or silence the `react/only-export-
  components` warnings by moving constants out of component files.

---

## 6. Design decisions for the owner to make

These change the work materially, so decide before implementing.

1. **Job creation without Current RMS.** There is no `POST /api/jobs`; jobs only exist via RMS
   onboarding. Recommend adding a plain "New job" (name, venue, dates) so prep can start before a
   quote is raised and so the app can be demoed/tested. Link to RMS later from the Current RMS tab.
2. **Brand.** Blue gradient square (sidebar/login) or purple lightning bolt (favicon)? Recommend
   the bolt everywhere: it is distinctive and reads as "lighting". Keep the blue accent for UI.
3. **Time and date format.** 24-hour everywhere, dates as `Thu 15 Oct`, locale pinned to en-GB
   rather than inherited from the browser. Recommend yes.
4. **Native dialogs vs modals.** Recommend modals for destructive actions and toasts for success.
5. **What the public apply form collects.** Recommend moving bank details and address to the
   onboarding-complete step.
6. **Spare labelling.** `513 + 514 + Spare + Spare + Spare + Spare` vs `513 + 514 + 4× Spare` vs
   `513 – 514 + Spare`. Depends on what the crew expect on the physical case.
7. **USER editing global settings.** USER can edit Case Rules, Location Colours and Import Mapping.
   Fine for a small team; worth a permission flag if more users come on.
8. **Delete on job cards.** Recommend removing it from the card and keeping it in Job Settings with
   a typed-name confirm, same as the print confirm gate.
9. **Settings grouping** per §4 (Prep / Integrations / People / System).
10. **Inline-edit tables.** Keep inline editing but switch to read-mode rows with edit-on-click, or
    keep inputs but add row-level saved/error feedback? Recommend read-mode rows.

---

## 7. Suggested order of work

1. **Security pass** (§2.1–2.5, then 2.6): upload hardening, `requireJobVisible`, role checks on
   job/logo/plot writes and printer settings, rate limits on public POSTs, server-side
   `mustChangePassword`, session revocation. Add zod schemas as each route is touched.
2. **Correctness pass** (§3.1–3.8): dates fallback + dashboard filter, seed race, secondary-nav
   width, file-input position, 404 + error boundary + titles, signage fallback, input widths and
   table scroll wrapper, CrewMarginPanel hook.
3. **Infrastructure for the UX pass** (§5): `useLoad`, `useMutation`, `ConfirmModal`/`PromptModal`,
   `utils/format.ts`, utility CSS classes, split `api/client.ts`, lazy routes. Then sweep the
   §3.9 list.
4. **Screen work** (§4) in this order: Jobs list cards and sorting → Dashboard "this week" →
   Print Queue layout → Job Settings split → Settings grouping → Crew portal "next call" + PWA →
   Signage polish → Contacts/Crew card layouts for phones.
5. **Tests:** Playwright smoke on the seeded flow; unit tests for spares in `casePacking`.

---

## Appendix: verification notes

- `npm test`: 10 passing (shared + server). `tsc -b` clean. `vite build` OK with chunk-size warning.
- `oxlint`: 1 error (`CrewMarginPanel.tsx:34` rules-of-hooks), 12 warnings.
- Overflow probe (document `scrollWidth` vs viewport): `/apply` 2254/1440 (file inputs);
  `/jobs/:id` 1089/390 and `/settings/users` 521/390 (secondary nav).
- Keyboard tab order through the admin shell and job tabs is sensible; focus rings are visible.
- The "Applications" highlight visible in several settings screenshots was the mouse resting on it
  after a click, not a bug — confirmed by reading `className` on each nav link.
- Playwright + seed scripts used for this assessment are not committed; the seeding is ~120 lines
  against the public API plus three direct `prisma.job.create` calls (because there is no job
  creation endpoint) and is easy to recreate for a smoke test.
