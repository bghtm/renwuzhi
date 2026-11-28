@echo off
setlocal
cd /d "%~dp0"

rem ---- kuake-renwuzhi local site launcher ----
where node >nul 2>nul
if errorlevel 1 goto nonode

if not exist "data\media-map.json" (
  echo [1/2] building media index ...
  if exist "tools\build-data.py" python "tools\build-data.py"
)

echo.
echo [2/2] starting local site -- close this window to stop
echo.
node "server.mjs" --open %*
pause
exit /b 0

:nonode
echo.
echo   [!] Node.js not found. Install Node.js 18+ from https://nodejs.org/
echo.
pause
exit /b 1
