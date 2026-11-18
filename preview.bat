@echo off
setlocal

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 18+ is required to preview pixelfx. 1>&2
  pause
  exit /b 1
)

node "%~dp0tools\serve.mjs" %* --open
set "preview_exit=%errorlevel%"
if not "%preview_exit%"=="0" pause
exit /b %preview_exit%
