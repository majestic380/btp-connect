# agent.ps1
# Rôle: appliquer les changements (déjà présents dans ce repo), builder, puis vérifier le lancement.
# Usage: .\agent.ps1

$ErrorActionPreference = "Stop"

function Step { param([string]$msg) Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Run  { param([string]$cmd) Write-Host ">> $cmd" -ForegroundColor Gray; Invoke-Expression $cmd }

try {
  Set-Location $PSScriptRoot

  Step "Install"
  if (Test-Path "package-lock.json") { Run "npm ci" } else { Run "npm install" }

  Step "Dev sanity check (10s)"
  # Launch dev, wait, then stop (best-effort)
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev" -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 10
  if (!$p.HasExited) {
    Stop-Process -Id $p.Id -Force
    Write-Host "Dev: OK (process started)" -ForegroundColor Green
  } else {
    Write-Host "Dev: process exited early (check logs by running npm run dev manually)" -ForegroundColor Yellow
  }

  Step "Pack win-unpacked"
  Run "npm run pack"

  Step "Verify exe exists"
  $exe = Get-ChildItem -Path ".\dist\win-unpacked" -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $exe) { throw "Aucun exe trouvé dans dist\\win-unpacked" }
  Write-Host "Exe: $($exe.FullName)" -ForegroundColor Green

  Step "Launch exe (no console) - 5s"
  $app = Start-Process -FilePath $exe.FullName -PassThru
  Start-Sleep -Seconds 5
  if ($app.HasExited) {
    Write-Host "L'app s'est fermée trop vite. Vérifie l'Event Viewer (Application Error 1000)." -ForegroundColor Yellow
  } else {
    Write-Host "L'app tourne. Ferme-la manuellement (ou via le Gestionnaire des tâches)." -ForegroundColor Green
  }

  Step "FIN OK"
}
catch {
  Write-Host "`nERREUR:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
