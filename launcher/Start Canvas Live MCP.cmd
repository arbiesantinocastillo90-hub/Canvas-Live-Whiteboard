@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo The optional AI companion requires Node.js 24.
  echo Install Node.js 24, then open this file again.
  pause
  exit /b 1
)
node.exe -e "if (Number(process.versions.node.split('.')[0]) !== 24) process.exit(1)"
if errorlevel 1 (
  echo Use Node.js 24 to start the optional AI companion.
  pause
  exit /b 1
)
node.exe "%~dp0mcp\server.mjs"
if errorlevel 1 pause
