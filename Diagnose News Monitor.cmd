@echo off
setlocal
cd /d "%~dp0"
powershell -NoLogo -ExecutionPolicy Bypass -File "%~dp0scripts\doctor.ps1" %*
set EXIT_CODE=%ERRORLEVEL%
echo.
pause
endlocal
exit /b %EXIT_CODE%
