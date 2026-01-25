Param(
  [ValidateSet('local','lan','cloud')]
  [string]$Mode = 'local',
  [int]$BackendPort = 3000,
  [int]$CloudBackendPort = 3999,
  [switch]$SkipPack
)

$ErrorActionPreference = 'Stop'

function Write-Log($msg) {
  $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Write-Host "[$ts] $msg"
}

function Wait-HttpOk([string]$Url, [int]$TimeoutSec = 25) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $Url
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) { return $true }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  return $false
}

function Is-HttpOk([string]$Url) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $Url
    return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300)
  } catch {
    return $false
  }
}

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

# Use an isolated userData directory for deterministic tests.
$userDataDir = Join-Path $root "qa\\userdata\\$Mode"
New-Item -ItemType Directory -Force -Path $userDataDir | Out-Null
$env:BTP_USERDATA_DIR = $userDataDir

Write-Log "Standalone smoke - mode=$Mode userData=$userDataDir"

# Ensure backend is built (needed for local/lan spawn and for cloud helper backend).
$builtBackend = Join-Path $root "backend\\dist\\server.js"
if (-not (Test-Path $builtBackend)) {
  Write-Log "Backend build missing. Running setup:backend..."
  npm run setup:backend
}

# Write app.config.json for this mode
$cfg = @{
  mode = $Mode
  apiUrl = "http://127.0.0.1:$BackendPort"
  backendPort = $BackendPort
  lanExpose = $false
}

if ($Mode -eq 'lan') {
  $cfg.lanExpose = $true
}

if ($Mode -eq 'cloud') {
  $cfg.apiUrl = "http://127.0.0.1:$CloudBackendPort"
  # backendPort is intentionally unused in cloud mode
}

$cfgPath = Join-Path $userDataDir "app.config.json"
$cfg | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 $cfgPath
Write-Log "Wrote config: $cfgPath"

# Optional: build unpacked app (helps catch packaging regressions).
if (-not $SkipPack) {
  Write-Log "Running npm run pack (unpacked)..."
  npm run pack
}

# If cloud mode, start a helper backend on CloudBackendPort.
$cloudProc = $null
if ($Mode -eq 'cloud') {
  Write-Log "Starting helper backend for cloud mode on port $CloudBackendPort"
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "node"
  $psi.Arguments = "\"$builtBackend\""
  $psi.WorkingDirectory = (Join-Path $root "backend")
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $false
  $psi.RedirectStandardError = $false
  $psi.EnvironmentVariables["PORT"] = "$CloudBackendPort"
  $psi.EnvironmentVariables["HOST"] = "127.0.0.1"
  $psi.EnvironmentVariables["BTP_MODE"] = "cloud-helper"
  $cloudProc = [System.Diagnostics.Process]::Start($psi)

  if (-not (Wait-HttpOk "http://127.0.0.1:$CloudBackendPort/health" 25)) {
    throw "Cloud helper backend did not become healthy on port $CloudBackendPort"
  }
}

# Start Electron app (silent/minimized) so it can spawn backend when needed.
Write-Log "Starting Electron app (silent)"
$electronCmd = Join-Path $root "node_modules\\.bin\\electron.cmd"
$appProc = Start-Process -FilePath $electronCmd -ArgumentList ". --silent --minimized" -PassThru

try {
  if ($Mode -eq 'cloud') {
    # Cloud mode: Electron must NOT start local backend; cloud helper must be OK.
    if (-not (Wait-HttpOk "http://127.0.0.1:$CloudBackendPort/health" 10)) {
      throw "Expected cloud backend healthcheck to be OK"
    }

    $localHealth = Is-HttpOk "http://127.0.0.1:$BackendPort/health"
    if ($localHealth) {
      throw "Expected local backend NOT to be healthy in cloud mode (port $BackendPort)"
    }

    Write-Log "OK: cloud backend reachable and local backend not started."
  } else {
    # local/lan: Electron should spawn local backend on BackendPort.
    if (-not (Wait-HttpOk "http://127.0.0.1:$BackendPort/health" 25)) {
      throw "Expected local backend healthcheck to be OK on port $BackendPort"
    }
    Write-Log "OK: local backend healthy."
  }
}
finally {
  Write-Log "Stopping Electron app"
  try { Stop-Process -Id $appProc.Id -Force -ErrorAction SilentlyContinue } catch {}
  if ($cloudProc) {
    Write-Log "Stopping cloud helper backend"
    try { Stop-Process -Id $cloudProc.Id -Force -ErrorAction SilentlyContinue } catch {}
  }
}

Write-Log "Standalone smoke complete."
