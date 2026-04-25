@echo off
setlocal
cd /d "%~dp0"
powershell -NoLogo -ExecutionPolicy Bypass -File "%~dp0scripts\stop-dev.ps1" %*
set EXIT_CODE=%ERRORLEVEL%
echo.
if not "%EXIT_CODE%"=="0" (
  echo stop-dev failed with exit code %EXIT_CODE%.
) else (
  echo stop-dev finished successfully.
)
echo.
pause
endlocal
exit /b %EXIT_CODE%
