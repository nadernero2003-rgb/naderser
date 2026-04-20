@echo off
set "DIST_DIR=dist"

echo Clearing old files...
if exist %DIST_DIR% rd /s /q %DIST_DIR%

echo Creating directories...
mkdir %DIST_DIR%
mkdir %DIST_DIR%\src
mkdir %DIST_DIR%\styles

echo Copying main files...
if exist index.html copy index.html %DIST_DIR%\
if exist favicon.png copy favicon.png %DIST_DIR%\
if exist app-icon.png copy app-icon.png %DIST_DIR%\
if exist manifest.json copy manifest.json %DIST_DIR%\
if exist sw.js copy sw.js %DIST_DIR%\
if exist _redirects copy _redirects %DIST_DIR%\
if exist _headers copy _headers %DIST_DIR%\

echo Copying source folders...
xcopy src %DIST_DIR%\src /e /i /y
xcopy styles %DIST_DIR%\styles /e /i /y

echo ------------------------------------------
echo Preparation Complete! 
echo Drag the "dist" folder to Netlify.
echo ------------------------------------------
pause
