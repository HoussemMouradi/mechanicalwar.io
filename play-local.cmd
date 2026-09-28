@echo off
rem Serves the game on http://127.0.0.1:4173 and opens it (ES modules do not run from file://).
cd /d "%~dp0"
start "" http://127.0.0.1:4173
node scripts/serve.cjs
