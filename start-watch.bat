@echo off
rem Double-click to start watching. Alert-only. Close this window (or press Ctrl+C) to stop.
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo [FAIL] Node.js not found. Install Node 20+ from https://nodejs.org and try again. & pause & exit /b 1)
node bin\qnet-alert.js doctor --offline
if errorlevel 1 (echo [FAIL] Fix the FAIL lines above, then run this file again. & pause & exit /b 1)
node bin\qnet-alert.js %*
echo Watcher stopped.
pause
