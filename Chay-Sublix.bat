@echo off
setlocal
chcp 65001 >nul
title SUBLIX - Luon chay ban moi nhat (Dev Mode)

rem ============================================================
rem  SUBLIX - FILE CHAY CHUAN (moi lan chay = code moi nhat)
rem  Khong can build release nua.
rem  - Sua giao dien (React): tu cap nhat ngay (hot reload)
rem  - Sua code Rust: tu build lai, cho 10-60 giay
rem  - Cua so console nay la log cua app; dong no = tat app
rem  - Muon ban dong goi sieu toc: src-tauri\target\release\sublix.exe
rem ============================================================

set "PROJECT_DIR=H:\AI Project\sublix"

rem 1) Tat Sublix dang chay (neu co) de tranh khoa file
taskkill /F /IM sublix.exe /T >nul 2>&1

rem 2) Vao thu muc du an
if not exist "%PROJECT_DIR%\package.json" (
  echo [LOI] Khong tim thay du an Sublix tai: %PROJECT_DIR%
  echo       Sua lai dong "set PROJECT_DIR=..." trong file nay.
  pause
  exit /b 1
)
cd /d "%PROJECT_DIR%"

rem 3) Dam bao cargo/rustc co trong PATH cua phien nay
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

rem 4) Cai dependencies neu thieu (may moi / node_modules bi xoa)
if not exist "node_modules" (
  echo [Setup] Chua co node_modules, dang cai dat dependencies...
  call npm install
)

echo ============================================================
echo   SUBLIX - dang mo ban MOI NHAT...
echo   Lan dau / sau khi sua code Rust se cho 10-60 giay de build.
echo   Dong cua so nay = tat app.
echo ============================================================
echo.

rem 5) Chay che do dev: luon dong bo voi code hien tai trong may
call npm run tauri dev

echo.
echo [Sublix da tat - co the dong cua so nay]
pause
