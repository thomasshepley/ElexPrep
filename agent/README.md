# ElexPrep Windows print agent

Small background service for the office Windows machine that has the **Develop ineo+ 3320i**
driver installed. It polls the ElexPrep server for queued print jobs, prints each one through
SumatraPDF with the correct paper tray selected, and reports success/failure back so the
Print Jobs screen shows live status.

Use this when ElexPrep runs somewhere that can't print directly (e.g. in Docker) or when you
want printing to go through the real Windows driver. The server also supports a direct
network mode (PJL over port 9100) that needs no agent at all — pick whichever works better
with the printer in **ElexPrep → Printer Settings**.

## Quick start

1. **Install Node.js 18+** — https://nodejs.org (LTS build) — and **SumatraPDF** —
   https://www.sumatrapdfreader.org (free, tiny, scriptable PDF printer).
2. Copy this whole `agent/` folder onto the Windows machine with the printer driver installed.
3. **In ElexPrep**: Printer Settings → set method to **Windows agent**, fill in the Windows
   printer name, then click **Generate agent token** and copy it.
4. Double-click **`setup.bat`** — it creates `agent-config.json` from the template and opens
   it for editing. Fill in:
   - `serverUrl` — wherever ElexPrep runs, e.g. `http://192.168.1.50:4000`
   - `agentToken` — the token you just copied
   - `sumatraPath` — only if SumatraPDF isn't at the default install path
5. Double-click **`list-printers.bat`** to see every installed printer with its exact tray
   (bin) names. Enter those (or the printer name) into **ElexPrep → Printer Settings** under
   each tray's "Agent bin" field / the "Windows printer name" field.
6. Double-click **`start.bat`** to run the agent in a console window. Send a small test batch
   from a job's Print Queue in ElexPrep and watch it print. Leave the window open — closing
   it stops the agent; the window stays open after a crash so you can read the error.
7. Once it's working, right-click **`install-service.bat`** → **Run as administrator** to
   make it start automatically on boot, so nobody has to remember to double-click `start.bat`
   after a restart.

## How tray selection works

The server tags every print job with a tray (PAL → Tray 1, Fixture/Truss/Spike → Tray 2,
Cable/Other → Bypass, all configurable). The agent passes the tray's bin name to SumatraPDF
as `-print-settings "bin=<name>"`, which sets the paper source on the driver's print ticket —
the same thing as picking the tray in the print dialog.

## Troubleshooting

Everything the agent logs also goes to `agent/logs/agent.log` (rotated once it passes 5MB),
not just the console window — this is what to check after the agent's been running
unattended (e.g. as the scheduled task from step 7) and something went wrong with nobody
watching the screen.

- **401 / token rejected** — regenerate the token in Printer Settings and update
  `agent-config.json`; there is exactly one valid token at a time.
- **Prints from the wrong tray** — the bin name doesn't match the driver's. Re-run
  `list-printers.bat` and copy the name exactly (or use the bin *number* it reports).
- **Nothing prints, jobs stay QUEUED** — the server's Printer Settings method must be set to
  *Windows agent*; in Direct/Dry-run modes the server never leaves jobs for the agent.
- **Jobs go FAILED with a Sumatra error** — try printing the same PDF from the Sumatra UI on
  that machine; if that fails too it's a driver/queue problem, not an ElexPrep one.
- **"SumatraPDF not found"** — the agent checks `sumatraPath` exists before it starts; fix
  the path in `agent-config.json` (or reinstall SumatraPDF to the default location) and
  restart it.
- **"agent-config.json not found"** — run `setup.bat` first.
- **The console window vanished** — `start.bat` pauses on exit specifically so a crash stays
  on screen; if it's still disappearing, run `node elexprep-print-agent.mjs` directly from a
  command prompt so the window doesn't close at all.

## Manual setup (without the .bat scripts)

```powershell
cd path\to\ElexPrep\agent
copy agent-config.example.json agent-config.json
notepad agent-config.json          # fill in serverUrl + agentToken (+ sumatraPath if custom)
node elexprep-print-agent.mjs      # Ctrl+C to stop
```

To find tray names manually:

```powershell
& "C:\Program Files\SumatraPDF\SumatraPDF.exe" -list-printers
```

To register it as a proper Windows service with automatic restart (alternative to
`install-service.bat`'s scheduled task), use [NSSM](https://nssm.cc):

```powershell
nssm install ElexPrepPrintAgent "C:\Program Files\nodejs\node.exe" "C:\ElexPrep\agent\elexprep-print-agent.mjs"
```
