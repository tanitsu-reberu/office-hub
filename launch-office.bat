@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-office.ps1" %*
exit /b %ERRORLEVEL%