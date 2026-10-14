# Changelog

Newest entries first. Each push/merge gets exactly one entry - see
`scripts/bump-version.mjs` for how the version number itself advances. A `+` marks a
feature addition, a `-` marks a bug fix.

## v1.4.9 - 2026-10-14

+ Every page shows a placeholder shaped like its content while it loads
- Pages no longer jump around or shift sideways as their content loads
- Staff who are on a job's crew no longer see the admin view flash before the crew view

## v1.4.8 - 2026-10-14

+ Select fixtures and move them to another stage
- Patches imported from OneDrive now go into the stage you have selected instead of Ungrouped
- The project manager picker lists everyone who can run a job
- Fewer pages jump around while they load

## v1.4.7 - 2026-10-13

+ Phones held sideways and tablets get the app-style tab bar
- Chat messages with long words no longer spill off small phones
- The Schedule tab and filter tabs fit narrower screens

## v1.4.6 - 2026-10-13

+ On phones the site now feels like an app, with a floating tab bar: Home, Jobs, Alerts and More
+ New admin feature for job discussions
- The phone tab bar no longer gets cut off by curved screen corners
- Pages no longer scroll sideways on phones

## v1.4.5 - 2026-10-13

+ Reply to a specific message in job discussions
+ Send images and GIFs in job discussions
+ Named days with call and estimated wrap times
+ Deadline-style schedule points for entries with the same start and end time
+ Your next call time on the crew home page
+ New admin features for the job page, Schedule tab and Print Queue

## v1.4.4 - 2026-10-13

+ Patch import now lets you choose the patch file from OneDrive in a popup, including one you've imported before

## v1.4.3 - 2026-10-13

+ New admin features for the Crew margin and for Users and crew settings
- Signage screens can sign out again

## v1.4.2 - 2026-10-13

- Patch auto-import now finds patch PDFs anywhere in the job's OneDrive folder (and on the Plots tab), picks the one with the most patch rows, and says which files it checked

## v1.4.1 - 2026-10-13

+ Crew on a schedule entry is now a searchable list you click to add people
- Checkboxes in forms no longer drop onto their own line

## v1.4.0 - 2026-10-13

- Table rows on the Crew and Location Colours pages line up again
- Colour pickers show their colour
+ Chat groups in job discussions
+ Schedule entries open into a popup with where, who and notes
+ Your own slots are highlighted on your schedule
+ Location dropdowns on cases and labels
+ New admin features for the Crew tab and Crew settings

## v1.3.9 - 2026-10-13

+ New admin feature for bug reports

## v1.3.8 - 2026-10-13

+ Editable crew day rates
+ Location dropdown on fixtures
+ PM tag and coloured names
+ Adjustable logo size
- Crew margin counts scheduled days
- Pix columns only show for pixel fixtures

## v1.3.7 - 2026-10-13

+ Dashboard this-week strip
+ Crew next call and calendar export
+ Clearer print queue and schedule
+ Tidier crew settings

## v1.3.6 - 2026-10-13

+ New ELEX brand colours and logo
+ A bottom tab bar on phones
+ Jobs list with dates and prep progress
+ Grouped settings
+ Click-to-edit tables
+ Contact cards
+ A reorganised job settings page

## v1.3.5 - 2026-10-13

+ In-app dialogs instead of browser pop-ups
+ 24-hour UK dates throughout
- Fixed a batch of form and loading bugs

## v1.3.4 - 2026-10-13

- Job dates on the dashboard and crew schedule are correct again
- Phone layout fixes
- Signage fallback fixed
- Spare labels fixed

## v1.3.3 - 2026-10-13

- Security hardening for file uploads, job access and sign-in

## v1.3.2 - 2026-10-13

+ Added site lockdown controls and expanded admin user management, fixed a job visibility bug for some accounts

## v1.3.1 - 2026-10-13

+ Added a "Submit a bug" button to report issues directly from the app

## v1.3.0 - 2026-10-13

+ Colour-code schedule entries
+ Drag crew onto specific tasks
+ New entries default to the selected day

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

+ Discussion messages can be edited
+ Discussion threads can be locked
+ Removed messages leave an audit trail

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

+ Search on the pick list and imported fixtures list
+ Category filter on the pick list

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

+ Save plot button for CAD plots
- CAD plots now fit their real width instead of a fixed zoom

## v1.0.4 - 2026-10-12

- Fixed the job logo being zoomed in and cropped in print previews instead of fitting in its box

## v1.0.3 - 2026-10-12

- Wide tables scroll inside their panel instead of spilling out
- Some fixture columns are wider so text doesn't get cut off

## v1.0.2 - 2026-10-12

+ Widened the desktop layout and reworked the crew job page so Who, What, When and Where are always visible

## v1.0.1 - 2026-10-12

+ Added a version number and changelog viewer to the sidebar
