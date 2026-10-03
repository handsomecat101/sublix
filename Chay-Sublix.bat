@echo off
title Sublix v0.6.0
taskkill /F /IM sublix.exe /T >nul 2>&1
cd /d "%~dp0src-tauri"
start "" "%~dp0src-tauri\target\release\sublix.exe"
exit
