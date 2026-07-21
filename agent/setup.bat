@echo off
REM ElexPrep print agent - first-time setup.
REM Double-click this once before running start.bat.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on this machine.
  echo Install it from https://nodejs.org (LTS build), then run this script again.
  pause
  exit /b 1
)

if not exist agent-config.json (
  copy agent-config.example.json agent-config.json >nul
  echo Created agent-config.json from the template.
) else (
  echo agent-config.json already exists - leaving it as is.
)

echo.
echo Opening agent-config.json for editing - fill in:
echo   serverUrl    e.g. http://192.168.1.50:4000 (wherever ElexPrep runs)
echo   agentToken   from ElexPrep - Printer Settings - Generate agent token
echo   sumatraPath  only if SumatraPDF isn't at the default install path
echo.
notepad agent-config.json

echo.
echo Next: run list-printers.bat to find the exact tray (bin) names for
echo ElexPrep - Printer Settings, then run start.bat to start the agent.
pause
