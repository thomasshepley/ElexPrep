# ElexPrep Windows print agent

Small background service for the office Windows machine that has the **Develop ineo+ 3320i**
driver installed. It polls the ElexPrep server for queued print jobs, prints each one through
SumatraPDF with the correct paper tray selected, and reports success/failure back so the
Print Jobs screen shows live status.

Use this when ElexPrep runs somewhere that can't print directly (e.g. in Docker) or when you
want printing to go through the real Windows driver. The server also supports a direct
network mode (PJL over port 9100) that needs no agent at all — pick whichever works better
with the printer in **ElexPrep → Printer Settings**.

## Setup

1. **Install Node.js 18+** — https://nodejs.org (LTS build).
2. **Install SumatraPDF** — https://www.sumatrapdfreader.org (free, tiny, scriptable PDF
   printer). Default install path is `C:\Program Files\SumatraPDF\SumatraPDF.exe`.
3. **Find the exact tray (bin) names** the ineo+ driver exposes:

   ```powershell
   & "C:\Program Files\SumatraPDF\SumatraPDF.exe" -list-printers
   ```

   This prints each installed printer with its paper sizes **and input bins**. Note the bin
   names (or numbers) for Tray 1, Tray 2, and the Bypass Tray, and enter them in
   **ElexPrep → Printer Settings** under each tray's "Agent bin" field. The printer name
   shown here is also what goes in the "Windows printer name" field.
4. **Create the agent token** — in ElexPrep, Printer Settings → *Generate agent token*.
5. **Configure the agent**:

   ```powershell
   cd path\to\ElexPrep\agent
   copy agent-config.example.json agent-config.json
   notepad agent-config.json   # fill in serverUrl + agentToken (+ sumatraPath if custom)
   ```
6. **Test it in a console first**:

   ```powershell
   node elexprep-print-agent.mjs
   ```

   Set ElexPrep's Printer Settings method to **Windows agent**, send a small test batch from
   a job's Print Queue, and watch the agent log it print.

## Run at startup

Register it as a scheduled task that starts at boot (run from an elevated PowerShell):

```powershell
schtasks /Create /TN "ElexPrep Print Agent" /SC ONSTART /RU SYSTEM ^
  /TR "\"C:\Program Files\nodejs\node.exe\" \"C:\ElexPrep\agent\elexprep-print-agent.mjs\""
```

(Adjust paths. Alternatively use [NSSM](https://nssm.cc) to run it as a proper Windows
service with automatic restart: `nssm install ElexPrepPrintAgent "C:\Program Files\nodejs\node.exe" "C:\ElexPrep\agent\elexprep-print-agent.mjs"`.)

## How tray selection works

The server tags every print job with a tray (PAL → Tray 1, Fixture/Truss/Spike → Tray 2,
Cable/Other → Bypass, all configurable). The agent passes the tray's bin name to SumatraPDF
as `-print-settings "bin=<name>"`, which sets the paper source on the driver's print ticket —
the same thing as picking the tray in the print dialog.

## Troubleshooting

- **401 / token rejected** — regenerate the token in Printer Settings and update
  `agent-config.json`; there is exactly one valid token at a time.
- **Prints from the wrong tray** — the bin name doesn't match the driver's. Re-run
  `-list-printers` and copy the name exactly (or use the bin *number* it reports).
- **Nothing prints, jobs stay QUEUED** — the server's Printer Settings method must be set to
  *Windows agent*; in Direct/Dry-run modes the server never leaves jobs for the agent.
- **Jobs go FAILED with a Sumatra error** — try printing the same PDF from the Sumatra UI on
  that machine; if that fails too it's a driver/queue problem, not an ElexPrep one.
