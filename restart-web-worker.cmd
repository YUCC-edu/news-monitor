@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\restart-web-worker.ps1"
endlocal
