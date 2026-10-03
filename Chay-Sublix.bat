@echo off
title Sublix v0.6.0
taskkill /F /IM sublix.exe /T >nul 2>&1
cd /d "H:\AI Project\sublix\src-tauri"
start "" "H:\AI Project\sublix\src-tauri\target\release\sublix.exe"
exit
