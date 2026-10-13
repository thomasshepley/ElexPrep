# Changelog

Newest entries first. Each push/merge gets exactly one entry - see
`scripts/bump-version.mjs` for how the version number itself advances.

## v2.8.6 - 2026-10-13

- Add drag-and-drop crew-to-day assignment with day-blocks overview on the Schedule tab

## v2.8.5 - 2026-10-13

- Fix web build errors from nullable address and label-size typing

## v2.8.4 - 2026-10-13

- Fix DEPLOY.md DNS instructions - Cloudflare rejects subdomain-only zones

## v2.8.3 - 2026-10-13

- Add admin CLI for VPS operations and forced password reset

## v2.8.2 - 2026-10-13

- Rewrote deployment docs for an AWS EC2 VPS with Caddy for HTTPS, replacing the home-server Cloudflare Tunnel approach

## v2.7.2 - 2026-10-13

- Added a Windows Server print-agent troubleshooting note for the scheduled-task SYSTEM account

## v2.7.1 - 2026-10-13

- Security hardening pass before going live: locked down CORS, encrypted API keys at rest, timing-safe agent auth

## v2.6.1 - 2026-10-13

- Patch import now keeps unaddressed fixtures and merges re-imports instead of wiping them

## v2.5.1 - 2026-10-13

- Fixed CAD-PDF patch extraction, which was silently returning garbage for real exports

## v2.4.1 - 2026-10-12

- Added stage tabs across patch import, cases, labels and the print queue

## v2.3.1 - 2026-10-12

- Added stages to subdivide a job's patch import, cases and labels (backend)

## v2.2.1 - 2026-10-12

- Job logos can now be auto-detected from OneDrive with one click to apply

## v2.1.1 - 2026-10-12

- Discussion threads can now be edited, locked, and removed messages leave an audit trail

## v2.0.1 - 2026-10-12

- Show crew color dots directly on calendar days, not just inside the day popup

## v2.0.0 - 2026-10-12

- Added profile pictures for crew and staff accounts

## v1.9.8 - 2026-10-12

- Added a confirmation screen before sending to the printer, with an inline preview and a typed CONFIRM gate

## v1.8.8 - 2026-10-12

- Added Previous/Next cycling through every item's preview in the print queue

## v1.8.7 - 2026-10-12

- Added per-element font size editing to the label template customizer

## v1.7.7 - 2026-10-12

- Added support for up to 3 logos printed side by side on labels

## v1.6.7 - 2026-10-12

- Added search to the pick list and imported fixtures list, plus a category filter on the pick list

## v1.5.7 - 2026-10-12

- Added an Important Contacts section to jobs, visible to admins and assigned crew

## v1.4.7 - 2026-10-12

- Clarified that job dates and schedule entries can extend earlier than the Current RMS opportunity, for prep days

## v1.4.6 - 2026-10-12

- Added a toast notification system and auto-creation of case rules for new fixture types on import

## v1.3.6 - 2026-10-12

- Grouped the imported fixtures list by fixture type instead of one long flat list

## v1.3.5 - 2026-10-12

- Added a rainbow Everywhere location color for items that aren't tied to one spot

## v1.2.5 - 2026-10-12

- CAD plots now auto-fit their real width instead of a fixed zoom, and added a Save plot button

## v1.1.5 - 2026-10-12

- Fixed the job logo being zoomed in and cropped in print previews instead of fitting in its box

## v1.1.4 - 2026-10-12

- Fixed wide tables spilling out of their panel instead of scrolling, and widened some fixture columns so text doesn't get cut off

## v1.1.3 - 2026-10-12

- Widened the desktop layout and reworked the crew job page so Who, What, When and Where are always visible

## v1.0.3 - 2026-10-12

- Fixed the version bump rule to match what was asked, and cleaned up em dashes across the app

## v1.0.2 - 2026-10-12

- Added a version number and changelog viewer to the sidebar.

## v1.0.1 - 2026-10-12

- Start of version tracking.
