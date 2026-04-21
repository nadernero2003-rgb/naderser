@echo off
title نظام ادارة الخدمة (Port 8080)
chcp 65001 > nul
color 0A
cls

echo.
echo  ====================================================
echo    نظام ادارة الخدمة الكنسية - تشغيل الخادم
echo    المنفذ الجديد: 8080
echo  ====================================================
echo.
echo  جاري التحقق من Node.js...

node --version > nul 2>&1
if %errorlevel% NEQ 0 (
    color 0C
    echo.
    echo  [خطأ] Node.js غير مثبت على جهازك.
    echo.
    echo  حل المشكلة:
    echo  1. افتح VS Code
    echo  2. افتح الـ Terminal من قائمة Terminal
    echo  3. اكتب الأمر:  npx serve -p 8080 .
    echo  4. افتح المتصفح على: http://localhost:8080
    echo.
    pause
    exit /b 1
)

echo  تم ايجاد Node.js ✓
echo  جاري تشغيل الخادم...
echo.
echo  ════════════════════════════════════════════════════
echo    افتح المتصفح على:  http://localhost:8080
echo  ════════════════════════════════════════════════════
echo.

start "" http://localhost:8080
node "%~dp0server_8080.js"

pause
