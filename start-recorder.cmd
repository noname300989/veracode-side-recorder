@echo off
echo ===================================================
echo   Veracode SIDE Recorder - Electron App Launcher
echo ===================================================
echo.

:: Check if Node.js is installed by checking npm version
call npm -v >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in your PATH.
    echo Please install Node.js manually from https://nodejs.org/
    echo Once installed, reopen this script.
    pause
    exit /b 1
)

:: Navigate to the Electron App directory
cd /d "%~dp0electron-app"

:: Install dependencies if node_modules doesn't exist
if not exist "node_modules\" (
    echo [INFO] Installing dependencies... This may take a minute.
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
    echo [SUCCESS] Dependencies installed.
)

:: Run the app
echo [INFO] Starting the Electron app...
call npm start

if %ERRORLEVEL% neq 0 (
    echo [ERROR] The application exited with an error.
    pause
    exit /b 1
)
