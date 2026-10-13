# Changelog

Newest entries first. Each push/merge gets exactly one entry - see
`scripts/bump-version.mjs` for how the version number itself advances. A `+` marks a
feature addition, a `-` marks a bug fix.

## v1.3.8 - 2026-10-13

+ Added Copy all and Download .md buttons for bug reports on the Webmaster page

## v1.3.7 - 2026-10-13

- Editable crew day rates, crew margin counts scheduled days, location dropdown on fixtures, Pix columns only for pixel fixtures, PM tag and coloured names, adjustable logo size

## v1.3.6 - 2026-10-13

+ New ELEX brand colours and logo, a bottom tab bar on phones, jobs list with dates and prep progress, grouped settings, click-to-edit tables, contact cards and a reorganised job settings page

## v1.3.5 - 2026-10-13

- Replaced browser pop-ups with in-app dialogs, 24-hour UK dates throughout, and fixed a batch of form and loading bugs

## v1.3.4 - 2026-10-13

- Fix job dates on the dashboard and crew schedule, phone layout, signage fallback and spare labels

## v1.3.3 - 2026-10-13

- Security hardening for file uploads, job access and sign-in

## v1.3.2 - 2026-10-13

+ Added site lockdown controls and expanded admin user management, fixed a job visibility bug for some accounts

## v1.3.1 - 2026-10-13

+ Added a "Submit a bug" button to report issues directly from the app

## v1.3.0 - 2026-10-13

+ Color-code schedule entries, drag crew onto specific tasks, and default new entries to the selected day

## v1.2.9 - 2026-10-13

+ Auto-add Current RMS opportunity days, fix rainbow preview, add a read-only crew week view

## v1.2.8 - 2026-10-13

+ Added drag-and-drop crew-to-day assignment with a day-blocks overview on the Schedule tab

## v1.2.7 - 2026-10-13

- Fixed web build errors from a nullable fixture address and label-size typing

## v1.2.6 - 2026-10-13

+ Added an admin CLI for VPS operations and forced password reset

## v1.2.5 - 2026-10-13

+ Added a Caddy reverse proxy for automatic HTTPS on the AWS deployment

## v1.2.4 - 2026-10-13

- Security hardening pass before going live: locked down CORS, encrypted API keys at rest, timing-safe agent auth

## v1.2.3 - 2026-10-13

+ Patch import now keeps unaddressed fixtures and merges re-imports instead of wiping them

## v1.2.2 - 2026-10-13

- Fixed CAD-PDF patch extraction, which was silently returning garbage for real exports

## v1.2.1 - 2026-10-12

+ Added stage tabs across patch import, cases, labels and the print queue

## v1.2.0 - 2026-10-12

+ Added stages to subdivide a job's patch import, cases and labels (backend)

## v1.1.9 - 2026-10-12

+ Job logos can now be auto-detected from OneDrive with one click to apply

## v1.1.8 - 2026-10-12

+ Discussion threads can now be edited, locked, and removed messages leave an audit trail

## v1.1.7 - 2026-10-12

+ Show crew color dots directly on calendar days, not just inside the day popup

## v1.1.6 - 2026-10-12

+ Added profile pictures for crew and staff accounts

## v1.1.5 - 2026-10-12

+ Added a confirmation screen before sending to the printer, with an inline preview and a typed CONFIRM gate

## v1.1.4 - 2026-10-12

+ Added Previous/Next cycling through every item's preview in the print queue

## v1.1.3 - 2026-10-12

+ Added per-element font size editing to the label template customizer

## v1.1.2 - 2026-10-12

+ Added support for up to 3 logos printed side by side on labels

## v1.1.1 - 2026-10-12

+ Added search to the pick list and imported fixtures list, plus a category filter on the pick list

## v1.1.0 - 2026-10-12

+ Added an Important Contacts section to jobs, visible to admins and assigned crew

## v1.0.9 - 2026-10-12

- Clarified that job dates and schedule entries can extend earlier than the Current RMS opportunity, for prep days

## v1.0.8 - 2026-10-12

+ Added a toast notification system and auto-creation of case rules for new fixture types on import

## v1.0.7 - 2026-10-12

+ Grouped the imported fixtures list by fixture type instead of one long flat list

## v1.0.6 - 2026-10-12

+ Added a rainbow Everywhere location color for items that aren't tied to one spot

## v1.0.5 - 2026-10-12

+ CAD plots now auto-fit their real width instead of a fixed zoom, and added a Save plot button

## v1.0.4 - 2026-10-12

- Fixed the job logo being zoomed in and cropped in print previews instead of fitting in its box

## v1.0.3 - 2026-10-12

- Fixed wide tables spilling out of their panel instead of scrolling, and widened some fixture columns so text doesn't get cut off

## v1.0.2 - 2026-10-12

+ Widened the desktop layout and reworked the crew job page so Who, What, When and Where are always visible

## v1.0.1 - 2026-10-12

+ Added a version number and changelog viewer to the sidebar
