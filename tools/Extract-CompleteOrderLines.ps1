$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot
Set-Location ".."  # torna alla root repo

function Write-Section([string]$t) {
  Write-Host "`n==> $t" -ForegroundColor Cyan
}

Write-Section "1) Cerco la funzione nelle migration locali (supabase/migrations)"
$hits = @()

$pathsToScan = @(
  (Join-Path (Get-Location) "supabase\migrations"),
  (Join-Path (Get-Location) "supabase")
) | Where-Object { Test-Path $_ }

foreach ($p in $pathsToScan) {
  $hits += Get-ChildItem -Path $p -Recurse -Filter *.sql -ErrorAction SilentlyContinue |
    Select-String -Pattern '\bcomplete_order_lines\b' -SimpleMatch -List |
    Select-Object -ExpandProperty Path
}

$hits = $hits | Sort-Object -Unique

if ($hits.Count -gt 0) {
  Write-Host "Trovata in file SQL:" -ForegroundColor Green
  $hits | ForEach-Object { Write-Host " - $_" -ForegroundColor DarkGray }

  # Provo ad estrarre il blocco CREATE FUNCTION dal primo file che contiene la funzione
  $file = $hits[0]
  Write-Section "2) Estraggo CREATE FUNCTION dal file: $file"

  $raw = Get-Content -LiteralPath $file -Raw

  # Estrazione robusta: da CREATE (OR REPLACE) FUNCTION complete_order_lines ... fino a LANGUAGE ...;
  $rx = '(?is)\bcreate\s+(or\s+replace\s+)?function\s+public\.?complete_order_lines\b.*?;\s*'
  $m = [regex]::Match($raw, $rx)

  if (-not $m.Success) {
    # fallback: se non c'è "public." o se finisce con $$ ... $$;
    $rx2 = '(?is)\bcreate\s+(or\s+replace\s+)?function\s+complete_order_lines\b.*?\$\$\s*;\s*'
    $m = [regex]::Match($raw, $rx2)
  }

  if ($m.Success) {
    $out = Join-Path (Join-Path (Get-Location) "tools") "complete_order_lines.sql"
    [System.IO.File]::WriteAllText($out, $m.Value.Trim() + "`r`n", (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "OK: estratto -> $out" -ForegroundColor Green
    exit 0
  }

  Write-Host "Trovato riferimento alla funzione, ma non riesco a estrarre il blocco CREATE FUNCTION da quel file." -ForegroundColor Yellow
  Write-Host "Apri il file e cerca 'create function complete_order_lines'." -ForegroundColor Yellow
  exit 0
}

Write-Section "Niente in migration locali. Fallback: dump schema con Supabase CLI (in FILE, non in console)"

# Serve Supabase CLI e (spesso) Docker: se manca, qui ti dirà chiaramente cosa non va
$dump = Join-Path (Join-Path (Get-Location) "tools") "_schema_public.sql"

# Prova a dumpare SOLO lo schema public in un file (molto più sicuro che spararlo in console)
# Nota: --linked usa il progetto linkato nel repo (supabase link). Se non è linkato, esplode con messaggio utile.
& supabase db dump --linked --schema public --file $dump | Out-Null

if (-not (Test-Path $dump)) { throw "Dump non creato: $dump" }

Write-Section "Estraggo la definizione dal dump: $dump"
$raw = Get-Content -LiteralPath $dump -Raw

$rx = '(?is)\bcreate\s+(or\s+replace\s+)?function\s+public\.?complete_order_lines\b.*?;\s*'
$m = [regex]::Match($raw, $rx)
if (-not $m.Success) {
  $rx2 = '(?is)\bcreate\s+(or\s+replace\s+)?function\s+complete_order_lines\b.*?\$\$\s*;\s*'
  $m = [regex]::Match($raw, $rx2)
}

if (-not $m.Success) { throw "Non trovo la definizione di complete_order_lines nel dump." }

$out = Join-Path (Join-Path (Get-Location) "tools") "complete_order_lines.sql"
[System.IO.File]::WriteAllText($out, $m.Value.Trim() + "`r`n", (New-Object System.Text.UTF8Encoding($false)))
Write-Host "OK: estratto -> $out" -ForegroundColor Green