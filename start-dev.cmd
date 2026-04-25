@echo off
setlocal
cd /d "%~dp0"
powershell -NoLogo -ExecutionPolicy Bypass -File "%~dp0scripts\start-dev.ps1" %*
set EXIT_CODE=%ERRORLEVEL%
echo.
if not "%EXIT_CODE%"=="0" (
  echo start-dev failed with exit code %EXIT_CODE%.
  echo Read the message above, then fix that step and run this file again.
) else (
  echo start-dev finished successfully.
)
echo.
pause
endlocal
exit /b %EXIT_CODE%
