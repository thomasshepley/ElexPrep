@echo off
REM Runs the ElexPrep print agent in this console window. Leave this window open -
REM closing it stops the agent. Press Ctrl+C to stop it cleanly.

cd /d "%~dp0"

if not exist agent-config.json (
  echo agent-config.json not found - run setup.bat first.
  pause
  exit /b 1
)

node elexprep-print-agent.mjs

echo.
echo The agent has stopped. If that wasn't expected, scroll up to see the error above.
pause
