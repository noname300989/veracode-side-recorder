@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
set "APPDIR=%ROOT%electron-app"
set "ELECTRON_EXE=%APPDIR%\node_modules\electron\dist\electron.exe"
set "NPMCMD="
set "NODEHOME="

where node >nul 2>nul
if not errorlevel 1 (
  for %%I in (node.exe) do set "NODEHOME=%%~$PATH:I"
)

where npm.cmd >nul 2>nul
if not errorlevel 1 (
  for %%I in (npm.cmd) do set "NPMCMD=%%~$PATH:I"
)

if not defined NPMCMD (
  for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_*") do (
    if not defined NODEHOME (
      for /r "%%~fD" %%N in (node.exe) do if not defined NODEHOME set "NODEHOME=%%~dpN"
    )
    if not defined NPMCMD (
      for /r "%%~fD" %%N in (npm.cmd) do (
        echo %%~fN | findstr /i /c:"corepack" >nul
        if errorlevel 1 if not defined NPMCMD set "NPMCMD=%%~fN"
      )
    )
  )
)

if not defined NPMCMD (
  where winget >nul 2>nul
  if errorlevel 1 (
    echo Node.js and npm were not found, and winget is unavailable.
    echo Install Node.js manually once, then run this launcher again.
    pause
    exit /b 1
  )

  echo Node.js was not found. Installing Node.js LTS...
  winget install --id OpenJS.NodeJS.LTS --source winget --accept-package-agreements --accept-source-agreements --scope user --silent

  for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_*") do (
    if not defined NODEHOME (
      for /r "%%~fD" %%N in (node.exe) do if not defined NODEHOME set "NODEHOME=%%~dpN"
    )
    if not defined NPMCMD (
      for /r "%%~fD" %%N in (npm.cmd) do (
        echo %%~fN | findstr /i /c:"corepack" >nul
        if errorlevel 1 if not defined NPMCMD set "NPMCMD=%%~fN"
      )
    )
  )
)

if not defined NODEHOME if defined NPMCMD (
  for %%I in ("%NPMCMD%") do set "NODEHOME=%%~dpI"
)

if not defined NODEHOME (
  echo Node.js could not be located after installation.
  pause
  exit /b 1
)

set "PATH=%NODEHOME%;%PATH%"

if not exist "%ELECTRON_EXE%" (
  if not defined NPMCMD (
    echo npm.cmd could not be found.
    pause
    exit /b 1
  )
  pushd "%APPDIR%"
  call "%NPMCMD%" install
  if errorlevel 1 (
    popd
    echo npm install failed.
    pause
    exit /b 1
  )
  popd
)

start "" "%ELECTRON_EXE%" .
endlocal
