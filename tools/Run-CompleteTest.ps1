$ErrorActionPreference = "Stop"
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

# env
if (Test-Path -LiteralPath ".\.env.local") {
  Get-Content ".\.env.local" | ForEach-Object {
    if ($_ -match "^\s*#") { return }
    if ($_ -match "^\s*([A-Za-z0-9_]+)\s*=\s*(.+)\s*$") {
      $k = $matches[1]; $v = $matches[2].Trim()
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

function SBReq([string]$method, [string]$path, $body=$null, [string]$prefer=$null) {
  $u = $SB_URL.TrimEnd("/") + "/rest/v1/" + $path.TrimStart("/")
  $h = @{ apikey=$SB_KEY; Authorization="Bearer $SB_KEY"; Accept="application/json" }
  if ($prefer) { $h["Prefer"] = $prefer }
  if ($body -ne $null) { $h["Content-Type"] = "application/json" }

  try {
    if ($body -eq $null) {
      return Invoke-RestMethod -Method $method -Uri $u -Headers $h -TimeoutSec 30
    } else {
      return Invoke-RestMethod -Method $method -Uri $u -Headers $h -Body ($body | ConvertTo-Json -Depth 10) -TimeoutSec 30
    }
  } catch {
    Write-Host "`n==> HTTP ERROR:" -ForegroundColor Red
    Write-Host "URL: $u" -ForegroundColor DarkGray
    Write-Host $_.Exception.Message -ForegroundColor Red
    $b = Get-ErrBody $_.Exception
    if ($b) { Write-Host $b -ForegroundColor Yellow }
    throw
  }
}

function SBGet([string]$q) { SBReq "GET" $q $null $null }
function SBPostRet([string]$path, $body) { SBReq "POST" $path $body "return=representation" }
function SBPatch([string]$path, $body) { SBReq "PATCH" $path $body "return=minimal" }

# 1) ultimo ordine
$ord = (SBGet "ordini?select=id&order=created_at.desc&limit=1")[0]
if (-not $ord) { throw "Non trovo ordini. Creane uno dalla UI e riprova." }

# 2) articolo AC140821
$art = (SBGet "articoli?select=id,cod_articolo,magazzino,scatole_inventario,impegnate,scatole_impegnate&cod_articolo=eq.AC140821&limit=1")[0]
if (-not $art) { throw "Non trovo AC140821." }

Write-Host "Uso ordine=$($ord.id) articolo=$($art.cod_articolo) ($($art.id))" -ForegroundColor Green

# 3) forza stock sufficiente (1 scatola => 1 pezzo per questo test)
$needScat = 1
$needPz   = 1
$setMag = [Math]::Max([int]$art.magazzino, $needPz)
$setSc  = [Math]::Max([int]$art.scatole_inventario, $needScat)
SBPatch ("articoli?id=eq.{0}" -f $art.id) @{ magazzino = $setMag; scatole_inventario = $setSc } | Out-Null

# PRIMA articolo
$a1 = (SBGet ("articoli?select=id,cod_articolo,magazzino,scatole_inventario,impegnate,scatole_impegnate&id=eq.{0}&limit=1" -f $art.id))[0]
Write-Host "`n==> Articolo PRIMA: magazzino=$($a1.magazzino) scat_inv=$($a1.scatole_inventario) imp=$($a1.impegnate) scat_imp=$($a1.scatole_impegnate)" -ForegroundColor Cyan

# 4) inserisci riga e PRENDI ID vero
$rig = (SBPostRet "ordini_righe" @{
  ordine_id   = $ord.id
  articolo_id = $art.id
  scatole     = 1
  stato       = "CREATO"
})
$rId = $rig[0].id
if (-not $rId) { throw "Inserita riga ma id non ritornato." }

Write-Host "`n==> Creata riga ordini_righe: $rId" -ForegroundColor Green

# 5) completa via RPC
Write-Host "`n==> Chiamo RPC complete_order_lines..." -ForegroundColor Cyan
SBPostRet "rpc/complete_order_lines" @{ p_righe = @($rId) } | Out-Null
Write-Host "OK: RPC chiamata" -ForegroundColor Green

# 6) DOPO
$r2 = (SBGet ("ordini_righe?select=id,stato,completed_at&id=eq.{0}&limit=1" -f $rId))[0]
$a2 = (SBGet ("articoli?select=id,cod_articolo,magazzino,scatole_inventario,impegnate,scatole_impegnate&id=eq.{0}&limit=1" -f $art.id))[0]

Write-Host "`n==> Riga DOPO: stato=$($r2.stato) completed_at=$($r2.completed_at)" -ForegroundColor Cyan
Write-Host "==> Articolo DOPO: magazzino=$($a2.magazzino) scat_inv=$($a2.scatole_inventario) imp=$($a2.impegnate) scat_imp=$($a2.scatole_impegnate)" -ForegroundColor Cyan

Write-Host "`n==> DELTA (DOPO - PRIMA)" -ForegroundColor Cyan
[PSCustomObject]@{
  cod_articolo             = $a1.cod_articolo
  magazzino_delta          = ([int]$a2.magazzino) - ([int]$a1.magazzino)
  scatole_inventario_delta = ([int]$a2.scatole_inventario) - ([int]$a1.scatole_inventario)
  impegnate_delta          = ([int]$a2.impegnate) - ([int]$a1.impegnate)
  scatole_impegnate_delta  = ([int]$a2.scatole_impegnate) - ([int]$a1.scatole_impegnate)
} | Format-List