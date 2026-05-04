@echo off
setlocal
cd /d "%~dp0"
powershell -NoLogo -ExecutionPolicy Bypass -File "%~dp0scripts\start-dev.ps1" -DockerApp %*
set EXIT_CODE=%ERRORLEVEL%
echo.
if not "%EXIT_CODE%"=="0" (
  echo News Monitor failed to start with exit code %EXIT_CODE%.
  echo Run "Diagnose News Monitor.cmd" for a health report.
) else (
  echo News Monitor is running at http://localhost:3000
)
echo.
pause
endlocal
exit /b %EXIT_CODE%
