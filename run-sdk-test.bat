@echo off
cd /d "%~dp0sdk"
call npm run test:sandbag
