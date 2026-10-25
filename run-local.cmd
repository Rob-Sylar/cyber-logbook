@echo off
rem Double-click to run Cyber Logbook on this PC at http://localhost:8080/
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" %*
