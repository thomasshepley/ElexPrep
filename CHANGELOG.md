# Changelog

Newest entries first. Each push/merge gets exactly one entry - see
`scripts/bump-version.mjs` for how the version number itself advances. A `+` marks a
feature addition, a `-` marks a bug fix.

## v1.6.5 - 2026-10-14

+ The Cable and Rigging tabs sit directly under Prep on each job, since they're part of prep

### Rigging (beta)

+ (Beta) Only admins can see the rigging calculator for now
+ (Beta) A Rigging tab on each job that works out the load on every hoist and venue point from the CAD plot, the patch and the cable plan
+ (Beta) Every load is static with a 10% safety margin added, and includes the motor, its chain and a rigging allowance
+ (Beta) Each point shows OK, Warning, Over capacity, Unknown capacity or Uplift against what it may carry
+ (Beta) Trusses on three or more hoists use the larger of the tributary and continuous beam answers, or either one on its own
+ (Beta) Switch between a plan map, an elevation per truss and a card per point, with point cards by default on phones
+ (Beta) Drag fixtures along a truss in the elevation and watch the loads change
+ (Beta) Each point shows how its load is worked out, line by line
+ (Beta) Truss checks against the maker's span table, with cantilevers that are too long flagged
+ (Beta) Point capacities come from the plot, from capacities saved for the venue, or typed in
+ (Beta) Print sheet and point table CSV with the method, margin, Calculated by and Checked by lines
+ (Beta) Rigging settings for the margin, warning levels, cable weights, trusses and hoists, with CM and EXE motors from 250 kg to 1 t

### Cable calculator (beta)

+ (Beta) The fixture database has its own settings page, with each fixture's weight for rigging
- (Beta) The cable calculator reads 9 m trusses from the plot correctly instead of 8 m

## v1.6.4 - 2026-10-14

- CAD plots are in one place on the Plots tab instead of split between CAD and Plot CAD PDFs

### Cable calculator (beta)

- (Beta) The cable calculator now finds the CAD plot in the job's OneDrive CAD folder, not just uploaded plots
- (Beta) The Add fixture form lines up properly

## v1.6.3 - 2026-10-14

+ Updates to the site no longer take it offline, at most a short pause while the new version starts
+ A Down for maintenance page while the site is being worked on, which reloads by itself when it's back

## v1.6.2 - 2026-10-14

+ Calendar items that run over several days show as one bar across the days, so the full name can be read
+ The dashboard shows the next 30 days instead of 7, with each day's name, call time and estimated wrap

## v1.6.1 - 2026-10-14

### Cable calculator (beta)

+ (Beta) Only admins can see the cable calculator for now
+ (Beta) A Cable tab on each job works out the cable pack for every truss and floor position from the patch, the plot and the company's cable rules
+ (Beta) Per position: circuits, Socas and whether each spider is TRUE1 or 16A, loom length rounded up to the lengths in stock, Soca extensions along the truss, DMX lines and jumpers
+ (Beta) Every number shows the rule that produced it, and anything assumed or worth checking is flagged
+ (Beta) Truss lengths and cable picks are read straight from the plot's Rigging Points table
+ (Beta) Motors are listed separately as a rigging pack
+ (Beta) Job totals by stock item, with quantities you can change by hand that stay when the plan is worked out again
+ (Beta) Dimmer city: Soca outs and amps per phase
+ (Beta) The job's cable lines from the Current RMS kit list are shown alongside to check against
+ (Beta) Download the cable list as CSV or copy it as text
+ (Beta) Settings > Cable rules: stock lengths, slack, swag, DMX from the distro or a node per truss, and which side dimmer city is on
+ (Beta) A fixture database of power draw, connectors and data, filled with common fixtures and editable

## v1.6.0 - 2026-10-14

### Signage Mode

+ The prep screen is rebuilt for the bay TV with next up, the pick list by group with counts, cases, shortages and recent scans
+ Crew sign in on the prep screen with their own login and only see the jobs they are on
+ Scan every unit with a USB or Bluetooth barcode scanner
+ Phones pair with a bay by QR code and scan with the camera
+ Scanner in the crew portal
+ Screens and phones on a job update live
+ Mark items short with a note
+ Prep complete moves a job to Awaiting Transport and Transport arrived books it out
+ Missing kit is flagged to the office at sign-off and at book-out
+ New admin feature for Settings
+ New admin feature for the job page

## v1.5.0 - 2026-10-14

- Fixed Project Manager Picker
- Loading placeholders shimmer more visibly

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
- The Schedule tab fits narrower screens
- Filter tabs fit narrower screens

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
+ New admin feature for the job page
+ New admin feature for the Schedule tab
+ New admin feature for the Print Queue

## v1.4.4 - 2026-10-13

+ Choose the patch file from OneDrive in a popup
+ A patch file you've imported before can be imported again

## v1.4.3 - 2026-10-13

+ New admin feature for the Crew margin
+ New admin feature for Users and crew settings
- Signage screens can sign out again

## v1.4.2 - 2026-10-13

+ Patch auto-import says which files it checked
- Patch auto-import finds patch PDFs anywhere in the job's OneDrive folder and on the Plots tab
- Patch auto-import picks the PDF with the most patch rows

## v1.4.1 - 2026-10-13

+ Crew on a schedule entry is now a searchable list you click to add people
- Checkboxes in forms no longer drop onto their own line

## v1.4.0 - 2026-10-13

+ Chat groups in job discussions
+ Schedule entries open into a popup with where, who and notes
+ Your own slots are highlighted on your schedule
+ Location dropdowns on cases and labels
+ New admin feature for the Crew tab
+ New admin feature for Crew settings
- Table rows on the Crew and Location Colours pages line up again
- Colour pickers show their colour

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
+ Next call on the crew home page
+ Calendar export for crew
+ Clearer print queue
+ Clearer schedule
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

- Safer file uploads
- Tighter checks on who can open a job
- Safer sign-in

## v1.3.2 - 2026-10-13

+ New admin feature for site security
+ New admin feature for user management
- Fixed some accounts seeing jobs they shouldn't, or not seeing ones they should

## v1.3.1 - 2026-10-13

+ Added a "Submit a bug" button to report issues directly from the app

## v1.3.0 - 2026-10-13

+ Colour-code schedule entries
+ Drag crew onto specific tasks
+ New entries default to the selected day

## v1.2.9 - 2026-10-13

+ A job's days are filled in automatically from its Current RMS dates
+ Crew get a read-only week overview
- Fixed the rainbow colour preview

## v1.2.8 - 2026-10-13

+ Added drag-and-drop crew-to-day assignment with a day-blocks overview on the Schedule tab

## v1.2.7 - 2026-10-13

- Fixed a website build error

## v1.2.6 - 2026-10-13

+ New admin feature for running the server

## v1.2.5 - 2026-10-13

+ New admin feature for running the server securely over HTTPS

## v1.2.4 - 2026-10-13

- Security improvements before going live

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

+ Confirmation screen with a preview before sending to the printer
+ Type CONFIRM before a print is sent

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

+ Pop-up toast notifications
+ Case rules are created automatically for new fixture types on import

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

+ Wider desktop layout
+ Who, What, When and Where are always visible on the crew job page

## v1.0.1 - 2026-10-12

+ Added a version number and changelog viewer to the sidebar
