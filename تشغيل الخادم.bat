@echo off
title نظام ادارة الخدمة
chcp 65001 > nul
color 0A
cls

echo.
echo  ====================================================
echo    نظام ادارة الخدمة الكنسية - تشغيل الخادم
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
    echo  3. اكتب الأمر:  npx serve .
    echo  4. افتح المتصفح على: http://localhost:3080
    echo.
    pause
    exit /b 1
)

echo  تم ايجاد Node.js ✓
echo  جاري تشغيل الخادم...
echo.
echo  ════════════════════════════════════════════════════
echo    افتح المتصفح على:  http://localhost:3080
echo  ════════════════════════════════════════════════════
echo.

start "" http://localhost:3080
node "%~dp0server.js"

pause
