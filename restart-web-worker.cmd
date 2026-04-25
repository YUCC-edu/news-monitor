@echo off
setlocal
cd /d "%~dp0"
powershell -NoLogo -ExecutionPolicy Bypass -File "%~dp0scripts\restart-web-worker.ps1" %*
set EXIT_CODE=%ERRORLEVEL%
echo.
if not "%EXIT_CODE%"=="0" (
  echo restart-web-worker failed with exit code %EXIT_CODE%.
) else (
  echo restart-web-worker finished successfully.
)
echo.
pause
endlocal
exit /b %EXIT_CODE%
