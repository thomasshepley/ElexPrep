@echo off
REM Registers the print agent as a scheduled task that starts automatically at boot, so it
REM doesn't need someone to log in and double-click start.bat every time the machine restarts.
REM Must be run as Administrator (right-click this file - "Run as administrator").

cd /d "%~dp0"

net session >nul 2>nul
if not %errorlevel%==0 (
  echo This needs to run as Administrator.
  echo Right-click install-service.bat and choose "Run as administrator", then try again.
  pause
  exit /b 1
)

if not exist agent-config.json (
  echo agent-config.json not found - run setup.bat first, then try again.
  pause
  exit /b 1
)

for /f "delims=" %%n in ('where node') do set NODE_PATH=%%n

schtasks /Create /TN "ElexPrep Print Agent" /SC ONSTART /RU SYSTEM /RL HIGHEST /F ^
  /TR "\"%NODE_PATH%\" \"%~dp0elexprep-print-agent.mjs\""

if %errorlevel%==0 (
  echo.
  echo Installed. The agent will now start automatically next time this machine boots.
  echo To start it right now without rebooting: schtasks /Run /TN "ElexPrep Print Agent"
  echo To remove it later: schtasks /Delete /TN "ElexPrep Print Agent" /F
) else (
  echo.
  echo Something went wrong registering the scheduled task - see the error above.
)
pause
