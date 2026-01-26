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
  # Se un rollback ha lasciato node_modules vuoto, ripristina prima di buildare
  if (-not (Test-Path ".\node_modules\.bin\next.cmd")) {
    Write-Host "==> next non trovato (node_modules mancante). Eseguo: npm ci"
    npm ci | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "npm ci fallito (exit code $LASTEXITCODE)" }
  }
$global:LASTEXITCODE = 0
  npm.cmd run build | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Build fallita (exit code $LASTEXITCODE)" }
}
catch {
  Write-Host "==> ERRORE: build/modifica fallita. Rollback in corso..."
  Pop-Location

  # ripristino progetto dal backup (senza toccare .git)
  robocopy $backupPath $ProjectPath /MIR /XD .git node_modules .next | Out-Null

  throw $_
}
finally {
  if ((Get-Location).Path -eq $ProjectPath) { Pop-Location }
}


