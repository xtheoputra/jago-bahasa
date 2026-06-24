@echo off
title Jago Bahasa
cd /d "%~dp0"

set PORT=5273

echo.
echo   ==========================================
echo     JAGO BAHASA - Media Pembelajaran Bahasa
echo   ==========================================
echo.
echo   Membuka di browser: http://localhost:%PORT%
echo   Biarkan jendela ini terbuka selama dipakai.
echo   Tutup jendela ini (atau tekan Ctrl+C) untuk berhenti.
echo.

rem Buka browser sebentar setelah server siap
start "" /b cmd /c "timeout /t 2 >nul & start "" http://localhost:%PORT%"

node server.js

echo.
echo   Node.js tidak ditemukan atau server berhenti.
echo   Pastikan Node.js sudah terpasang: https://nodejs.org
pause
