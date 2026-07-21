@echo off
REM Lists every installed printer with its paper sizes and input bins (trays) as SumatraPDF
REM sees them - use the exact bin names shown here in ElexPrep - Printer Settings, and the
REM printer name in the "Windows printer name" field.

set SUMATRA="C:\Program Files\SumatraPDF\SumatraPDF.exe"

if not exist %SUMATRA% (
  echo SumatraPDF not found at %SUMATRA%
  echo If it's installed somewhere else, edit this file's SUMATRA path or run:
  echo   "path\to\SumatraPDF.exe" -list-printers
  pause
  exit /b 1
)

%SUMATRA% -list-printers
echo.
echo (Output also saved to printers.txt in this folder.)
%SUMATRA% -list-printers > printers.txt
pause
