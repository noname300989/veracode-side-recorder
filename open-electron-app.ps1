param(
  [switch]$InstallIfMissing = $true
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = Join-Path $scriptRoot "electron-app"
$electronExe = Join-Path $appDir "node_modules\\electron\\dist\\electron.exe"

function Get-NpmCommand {
  $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($npmCommand) {
    return $npmCommand.Source
  }

  $wingetRoot = Join-Path $env:LOCALAPPDATA "Microsoft\\WinGet\\Packages"
  if (-not (Test-Path $wingetRoot)) {
    return $null
  }

  $candidate = Get-ChildItem $wingetRoot -Directory -Filter "OpenJS.NodeJS.LTS_*" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $candidate) {
    return $null
  }

  $npm = Get-ChildItem $candidate.FullName -Recurse -Filter "npm.cmd" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notlike "*\\corepack\\*" -and $_.FullName -notlike "*\\node_modules\\npm\\bin\\*" } |
    Select-Object -First 1

  if ($npm) {
    return $npm.FullName
  }

  $fallback = Get-ChildItem $candidate.FullName -Recurse -Filter "npm.cmd" -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if ($fallback) {
    return $fallback.FullName
  }

  return $null
}

function Get-NodeHomeFromWinget {
  $wingetRoot = Join-Path $env:LOCALAPPDATA "Microsoft\\WinGet\\Packages"
  if (-not (Test-Path $wingetRoot)) {
    return $null
  }

  $candidate = Get-ChildItem $wingetRoot -Directory -Filter "OpenJS.NodeJS.LTS_*" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $candidate) {
    return $null
  }

  $nodeExe = Get-ChildItem $candidate.FullName -Recurse -Filter "node.exe" -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if ($nodeExe) {
    return $nodeExe.DirectoryName
  }

  return $null
}

function Add-DirectoryToUserPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Directory
  )

  if (-not (Test-Path $Directory)) {
    return
  }

  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $pathParts = @()

  if ($userPath) {
    $pathParts = $userPath.Split(";") | Where-Object { $_ }
  }

  if ($pathParts -notcontains $Directory) {
    $newUserPath = if ($userPath) { "$userPath;$Directory" } else { $Directory }
    [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
  }

  if (($env:PATH.Split(";") | Where-Object { $_ }) -notcontains $Directory) {
    $env:PATH = "$Directory;$env:PATH"
  }
}

function Ensure-NodeAndNpm {
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue

  if ($nodeCommand -and $npmCommand) {
    Add-DirectoryToUserPath -Directory (Split-Path -Parent $nodeCommand.Source)
    return $npmCommand.Source
  }

  $nodeHome = Get-NodeHomeFromWinget
  if (-not $nodeHome -and $InstallIfMissing) {
    $wingetCommand = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $wingetCommand) {
      throw "Node.js is not installed and winget.exe is not available to install it automatically."
    }

    Write-Host "Node.js was not found. Installing Node.js LTS with winget..."
    & $wingetCommand.Source install --id OpenJS.NodeJS.LTS --source winget --accept-package-agreements --accept-source-agreements --scope user --silent
    $nodeHome = Get-NodeHomeFromWinget
  }

  if (-not $nodeHome) {
    throw "Node.js could not be located after installation."
  }

  Add-DirectoryToUserPath -Directory $nodeHome

  $npmPath = Join-Path $nodeHome "npm.cmd"
  if (-not (Test-Path $npmPath)) {
    throw "npm.cmd was not found in $nodeHome."
  }

  return $npmPath
}

if (-not (Test-Path $electronExe)) {
  if (-not $InstallIfMissing) {
    throw "Electron runtime is not installed. Run with -InstallIfMissing or install dependencies in $appDir first."
  }

  $npmPath = Ensure-NodeAndNpm
  $nodeHome = Split-Path -Parent $npmPath
  Add-DirectoryToUserPath -Directory $nodeHome

  Push-Location $appDir
  try {
    & $npmPath install
  } finally {
    Pop-Location
  }
}

$npmPath = Ensure-NodeAndNpm
$nodeHome = Split-Path -Parent $npmPath
Add-DirectoryToUserPath -Directory $nodeHome

Start-Process -FilePath $electronExe -ArgumentList "." -WorkingDirectory $appDir
