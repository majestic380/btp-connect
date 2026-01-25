Param(
  [string]$Path = "dist"
)
$ErrorActionPreference = "Stop"
if (-not (Test-Path $Path)) {
  Write-Host "Path not found: $Path" -ForegroundColor Red
  exit 1
}
$items = Get-ChildItem -Path $Path -File -Recurse
$out = Join-Path $Path "checksums.sha256"
"" | Out-File -FilePath $out -Encoding ascii
foreach ($i in $items) {
  $hash = Get-FileHash -Algorithm SHA256 -Path $i.FullName
  "$($hash.Hash.ToLower())  $($i.FullName.Replace((Resolve-Path $Path).Path + '\\',''))" | Add-Content -Path $out -Encoding ascii
}
Write-Host "Wrote $out"
