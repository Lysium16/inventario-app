$ErrorActionPreference = "Stop"
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

if (Test-Path -LiteralPath ".\.env.local") {
  Get-Content ".\.env.local" | ForEach-Object {
    if ($_ -match "^\s*#") { return }
    if ($_ -match "^\s*([A-Za-z0-9_]+)\s*=\s*(.+)\s*$") {
      $k = $matches[1]
      $v = $matches[2].Trim()
      if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length-2) }
      if ($v.StartsWith("'") -and $v.EndsWith("'")) { $v = $v.Substring(1, $v.Length-2) }
      [Environment]::SetEnvironmentVariable($k, $v, "Process")
    }
  }
}

$SB_URL = $env:NEXT_PUBLIC_SUPABASE_URL
$SB_KEY = $env:NEXT_PUBLIC_SUPABASE_ANON_KEY
if (-not $SB_URL -or -not $SB_KEY) { throw "Mancano NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY" }

function Get-ErrBody($ex) {
  try {
    $resp = $ex.Response
    if (-not $resp) { return $null }
    $stream = $resp.GetResponseStream()
    if (-not $stream) { return $null }
    $reader = New-Object System.IO.StreamReader($stream)
    return $reader.ReadToEnd()
  } catch { return $null }
}

function SBGet([string]$q) {
  $u = $SB_URL.TrimEnd("/") + "/rest/v1/" + $q.TrimStart("/")
  try {
    return Invoke-RestMethod -Method GET -Uri $u -Headers @{
      apikey=$SB_KEY; Authorization="Bearer $SB_KEY"; Accept="application/json"
    } -TimeoutSec 30
  } catch {
    Write-Host "`n==> GET ERROR (dettagli):" -ForegroundColor Red
    Write-Host "URL: $u" -ForegroundColor DarkGray
    Write-Host $_.Exception.Message -ForegroundColor Red
    $bodyText = Get-ErrBody $_.Exception
    if ($bodyText) { Write-Host $bodyText -ForegroundColor Yellow }
    throw
  }
}

function SBPost([string]$path, $body) {
  $u = $SB_URL.TrimEnd("/") + "/rest/v1/" + $path.TrimStart("/")
  try {
    return Invoke-RestMethod -Method POST -Uri $u -Headers @{
      apikey=$SB_KEY; Authorization="Bearer $SB_KEY"; Accept="application/json"; "Content-Type"="application/json"
    } -Body ($body | ConvertTo-Json -Depth 10) -TimeoutSec 30
  } catch {
    Write-Host "`n==> RPC ERROR (dettagli):" -ForegroundColor Red
    Write-Host "URL: $u" -ForegroundColor DarkGray
    Write-Host $_.Exception.Message -ForegroundColor Red
    $bodyText = Get-ErrBody $_.Exception
    if ($bodyText) { Write-Host $bodyText -ForegroundColor Yellow }
    throw
  }
}

Write-Host "`n==> Stato ordini_righe (ultime 500)..." -ForegroundColor Cyan
$rows = SBGet "ordini_righe?select=id,ordine_id,articolo_id,scatole,stato,created_at&order=created_at.desc&limit=500"

Write-Host "`n==> Conteggio per stato:" -ForegroundColor Cyan
$rows | Group-Object stato | Sort-Object Count -Descending | Format-Table Name,Count -AutoSize

$candidate = $null

foreach ($r in ($rows | Where-Object { $_.stato -ne "COMPLETATO" -and $_.articolo_id -and [int]$_.scatole -gt 0 })) {

  # Prima provo con pezzi_per_scatola; se la colonna non esiste, ripiego senza
  $art = $null
  try {
    $art = (SBGet "articoli?select=id,cod_articolo,magazzino,scatole_inventario,pezzi_per_scatola&`"id`"=eq.$($r.articolo_id)&limit=1")[0]
  } catch {
    $art = (SBGet "articoli?select=id,cod_articolo,magazzino,scatole_inventario&`"id`"=eq.$($r.articolo_id)&limit=1")[0]
  }

  if (-not $art) { continue }

  $pps = 1
  if ($art.PSObject.Properties.Name -contains "pezzi_per_scatola" -and $art.pezzi_per_scatola) {
    $pps = [int]$art.pezzi_per_scatola
    if ($pps -lt 1) { $pps = 1 }
  }

  $needScat = [int]$r.scatole
  $needPz   = $needScat * $pps
  $mz = [int]$art.magazzino
  $si = [int]$art.scatole_inventario

  if ($mz -ge $needPz -and $si -ge $needScat) {
    $candidate = [PSCustomObject]@{ r=$r; art=$art; pps=$pps; needScat=$needScat; needPz=$needPz }
    break
  }
}

if (-not $candidate) {
  Write-Host "`nNON trovo righe completabili nelle ultime 500 (stock insufficiente o righe rotte)." -ForegroundColor Yellow
  exit 0
}

$rId   = $candidate.r.id
$artId = $candidate.r.articolo_id

Write-Host "`n==> Usero' riga: $rId (stato=$($candidate.r.stato), scatole=$($candidate.needScat), pz=$($candidate.needPz))" -ForegroundColor Green
Write-Host "==> Articolo: $($candidate.art.cod_articolo) magazzino=$($candidate.art.magazzino) scat_inv=$($candidate.art.scatole_inventario) pz_per_scatola=$($candidate.pps)" -ForegroundColor Green

$a1 = (SBGet "articoli?select=id,cod_articolo,magazzino,scatole_inventario,impegnate,scatole_impegnate&`"id`"=eq.$artId&limit=1")[0]
Write-Host "`n==> Articolo PRIMA: $($a1.cod_articolo) magazzino=$($a1.magazzino) scat_inv=$($a1.scatole_inventario) imp=$($a1.impegnate) scat_imp=$($a1.scatole_impegnate)" -ForegroundColor Cyan

Write-Host "`n==> Chiamo RPC complete_order_lines..." -ForegroundColor Cyan
SBPost "rpc/complete_order_lines" @{ p_righe = @($rId) } | Out-Null
Write-Host "OK: RPC chiamata" -ForegroundColor Green

$r2 = (SBGet "ordini_righe?select=id,stato,completed_at&`"id`"=eq.$rId&limit=1")[0]
$a2 = (SBGet "articoli?select=id,cod_articolo,magazzino,scatole_inventario,impegnate,scatole_impegnate&`"id`"=eq.$artId&limit=1")[0]

Write-Host "`n==> Riga DOPO: stato=$($r2.stato) completed_at=$($r2.completed_at)" -ForegroundColor Cyan
Write-Host "`n==> Articolo DOPO: $($a2.cod_articolo) magazzino=$($a2.magazzino) scat_inv=$($a2.scatole_inventario) imp=$($a2.impegnate) scat_imp=$($a2.scatole_impegnate)" -ForegroundColor Cyan

Write-Host "`n==> DELTA (DOPO - PRIMA)" -ForegroundColor Cyan
[PSCustomObject]@{
  cod_articolo             = $a1.cod_articolo
  magazzino_delta          = ([int]$a2.magazzino) - ([int]$a1.magazzino)
  scatole_inventario_delta = ([int]$a2.scatole_inventario) - ([int]$a1.scatole_inventario)
  impegnate_delta          = ([int]$a2.impegnate) - ([int]$a1.impegnate)
  scatole_impegnate_delta  = ([int]$a2.scatole_impegnate) - ([int]$a1.scatole_impegnate)
} | Format-List