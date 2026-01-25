param(
    [switch]$NoPush
)

$ErrorActionPreference = "Stop"

function Step { param([string]$msg) Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Run  { param([string]$cmd) Write-Host ">> $cmd" -ForegroundColor Gray; Invoke-Expression $cmd }

try {
    Set-Location $PSScriptRoot

    Step "Verifications"
    if (-not (Test-Path "package.json")) { throw "package.json introuvable: pas la racine du projet" }

    Step "Install npm"
    if (Test-Path "package-lock.json") { Run "npm ci" } else { Run "npm install" }

    Step "Pack (win-unpacked, sans NSIS)"
    Run "npm run pack"

    Step "Ouvrir win-unpacked"
    $exe = Get-ChildItem -Path ".\dist\win-unpacked" -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($exe) {
        Start-Process $exe.Directory.FullName
        Write-Host "OK: $($exe.FullName)" -ForegroundColor Green
    } else {
        Write-Host "Aucun .exe trouve dans dist\win-unpacked" -ForegroundColor Yellow
    }

    Step "FIN OK"
}
catch {
    Write-Host "`nERREUR:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
