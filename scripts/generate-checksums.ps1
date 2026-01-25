param(
  [Parameter(Mandatory=$false)][string]$Dir = "."
)
$Out = Join-Path $Dir "CHECKSUMS.sha256"
Remove-Item -ErrorAction SilentlyContinue $Out
Get-ChildItem -Path $Dir -File | Sort-Object Name | ForEach-Object {
  $hash = Get-FileHash -Algorithm SHA256 $_.FullName
  "$($hash.Hash.ToLower())  $($_.Name)" | Add-Content -Path $Out
}
Write-Host "Wrote $Out"
