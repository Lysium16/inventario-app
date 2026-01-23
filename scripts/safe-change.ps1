param(
  [Parameter(Mandatory=$true)]
  [string]$Title,

  [Parameter(Mandatory=$true)]
  [scriptblock]$Action
)

$ErrorActionPreference = "Stop"

$ProjectPath = Join-Path $HOME "inventario-app"
if (-not (Test-Path $ProjectPath)) { throw "ProjectPath non trovato: $ProjectPath" }

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupPath = Join-Path $HOME ("inventario-app_BACKUP_" + $stamp + "_" + ($Title -replace '[^a-zA-Z0-9\-_]+','_'))

Write-Host "==> [SAFE-CHANGE] $Title"
Write-Host "==> Backup: $backupPath"

New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
robocopy $ProjectPath $backupPath /E /XD node_modules .next .git | Out-Null

Push-Location $ProjectPath
try {
  Write-Host "==> Eseguo Action..."
  & $Action

  Write-Host "==> Build..."
  npm.cmd run build

  if ($LASTEXITCODE -ne 0) { throw "Build fallita (exit code $LASTEXITCODE)" }  Write-Host "==> OK: build riuscita. Backup conservato: $backupPath"
}
catch {
  Write-Host "==> ERRORE: build/modifica fallita. Rollback in corso..."
  Pop-Location

  # ripristino progetto dal backup (senza toccare .git)
  robocopy $backupPath $ProjectPath /MIR /XD .git | Out-Null

  throw $_
}
finally {
  if ((Get-Location).Path -eq $ProjectPath) { Pop-Location }
}

