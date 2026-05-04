@echo off
setlocal
cd /d "%~dp0"
powershell -NoLogo -ExecutionPolicy Bypass -File "%~dp0scripts\stop-dev.ps1" %*
set EXIT_CODE=%ERRORLEVEL%
echo.
if not "%EXIT_CODE%"=="0" (
  echo Stop News Monitor failed with exit code %EXIT_CODE%.
) else (
  echo News Monitor stopped.
)
echo.
pause
endlocal
exit /b %EXIT_CODE%
