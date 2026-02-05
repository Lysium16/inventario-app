Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail([string]$msg) { throw $msg }

function Ensure-CleanGit {
  $st = git status --porcelain
  if ($st) { Fail ("Working tree non pulito. Sistemalo prima.`n{0}" -f $st) }
}

function New-Backup([string]$tag) {
  $ts = Get-Date -Format "yyyyMMdd_HHmmss"
  $src = (Get-Location).Path
  $dst = Join-Path $HOME ("inventario-app_BACKUP_{0}_{1}" -f $ts, $tag)
  Copy-Item $src $dst -Recurse -Force
  return $dst
}

function Restore-Backup([string]$backupDir) {
  $dst = (Get-Location).Path
  Get-ChildItem $dst -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force
  Copy-Item (Join-Path $backupDir "*") $dst -Recurse -Force
}

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { Fail ("File non trovato: {0}" -f $path) }
  return Get-Content $path -Raw -Encoding UTF8
}

function Write-Text([string]$path, [string]$content) {
  Set-Content -Path $path -Value $content -Encoding UTF8
}

function Insert-AfterFirstMatch([string]$path, [string]$matchText, [string]$insertText) {
  $txt = Read-Text $path
  $idx = $txt.IndexOf($matchText)
  if ($idx -lt 0) { Fail ("Ancora non trovata in {0}:`n---`n{1}`n---" -f $path, $matchText) }

  $lineEnd = $txt.IndexOf("`n", $idx)
  if ($lineEnd -lt 0) { $lineEnd = $txt.Length - 1 }

  $new = $txt.Substring(0, $lineEnd + 1) + $insertText + $txt.Substring($lineEnd + 1)
  Write-Text $path $new
}

function Replace-Once([string]$path, [string]$needle, [string]$replacement) {
  $txt = Read-Text $path
  $idx = $txt.IndexOf($needle)
  if ($idx -lt 0) { Fail ("Non trovo ancora nel file {0}:`n---`n{1}`n---" -f $path, $needle) }
  $new = $txt.Substring(0,$idx) + $replacement + $txt.Substring($idx + $needle.Length)
  Write-Text $path $new
}

# ---- MAIN ----
Set-Location "$HOME\inventario-app"
if (-not (Test-Path ".git")) { Fail ("Non sei in un repo git: {0}" -f (Get-Location)) }
Ensure-CleanGit

$backup = New-Backup "feat-scatole-impegnate-and-selection-ux"
Write-Host ("Backup creato: {0}" -f $backup) -ForegroundColor Green

$page = Join-Path (Get-Location) "app\page.tsx"
if (-not (Test-Path $page)) { Fail "Non trovo app\page.tsx" }

try {
  $txt = Read-Text $page

  # 0) Assicurati che useEffect sia importato (se usi React/useEffect esplicito non serve)
  # Se in alto hai: import { useEffect, useState } ... allora ok.
  # Qui non patchiamo import per non fare disastri. La build ci dirà se manca.

  # 1) Inserisci helper + auto-scroll + funzioni scatole dopo hook selected
  if (-not $txt.Contains("function getScatoleImpegnate")) {
    $anchor = "const [selected, setSelected] = useState<Articolo | null>"
    if (-not $txt.Contains($anchor)) { Fail "Non trovo hook selected/setSelected in page.tsx." }

    $insert = @"
  // --- UX: evidenzia selezione + auto-scroll riga selezionata
  useEffect(() => {
    const id = (selected as any)?.id
    if (!id) return
    const el = document.getElementById(`art-${id}`)
    if (el) el.scrollIntoView({ block: "nearest" })
  }, [ (selected as any)?.id ])

  // --- Helpers "robusti": prova vari nomi campo senza rompere nulla
  function getPezziPerScatola(a: any): number {
    const v =
      a?.pz_per_scatola ??
      a?.pezzi_per_scatola ??
      a?.pezziPerScatola ??
      a?.pieces_per_box ??
      a?.pcs_per_box
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  }

  function getPezziDisponibili(a: any): number {
    const v =
      a?.disponibili ??
      a?.quantita ??
      a?.qta ??
      a?.qty ??
      a?.qty_disponibile ??
      a?.pezzi ??
      a?.giacenza
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
  }

  function getScatoleImpegnate(a: any): number {
    const v = a?.scatole_impegnate ?? 0
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
  }

  function calcScatoleTotali(a: any): number {
    const pzBox = getPezziPerScatola(a)
    if (pzBox <= 0) return 0
    const pz = getPezziDisponibili(a)
    return Math.floor(pz / pzBox)
  }

  function calcScatoleDisponibili(a: any): number {
    return calcScatoleTotali(a) - getScatoleImpegnate(a)
  }

  async function setScatoleImpegnate(next: number) {
    const a: any = selected
    if (!a?.id) return
    const safeNext = Math.max(0, Math.floor(Number(next) || 0))

    const { error } = await supabase
      .from("articoli")
      .update({ scatole_impegnate: safeNext })
      .eq("id", a.id)

    if (error) throw error

    setSelected({ ...(a as any), scatole_impegnate: safeNext })
  }
"@

    Insert-AfterFirstMatch $page $anchor $insert
    Write-Host "Inseriti helper + auto-scroll + funzioni scatole." -ForegroundColor Green
  } else {
    Write-Host "Helper scatole già presenti: salto inserimento." -ForegroundColor DarkYellow
  }

  # 2) Highlight selezione nel map (NO ternario nel testo PowerShell, è solo una stringa TSX)
  $txt = Read-Text $page
  if (-not $txt.Contains("const isSel = (selected as any)?.id === (a as any)?.id")) {
    $needle = ".map((a) => {"
    if (-not $txt.Contains($needle)) { Fail "Non trovo '.map((a) => {' in page.tsx" }

    $replacement = @"
.map((a) => {
        const isSel = (selected as any)?.id === (a as any)?.id
        const rowCls =
          "w-full text-left rounded-2xl border px-3 py-2 transition " +
          (isSel
            ? "bg-neutral-100 border-neutral-900 shadow-sm"
            : "bg-white border-neutral-200 hover:bg-neutral-50")
"@
    Replace-Once $page $needle $replacement
    Write-Host "Inserita logica highlight nel map." -ForegroundColor Green
  } else {
    Write-Host "Highlight nel map già presente: salto." -ForegroundColor DarkYellow
  }

  # 3) Applica id DOM + className alla riga cliccabile (ancora: onClick={() => setSelected(a)})
  $txt = Read-Text $page
  if ($txt.Contains("onClick={() => setSelected(a)}") -and -not $txt.Contains("id={`art-${(a as any).id}`}")) {
    Replace-Once $page "onClick={() => setSelected(a)}" "id={`art-${(a as any).id}`} className={rowCls} onClick={() => setSelected(a)}"
    Write-Host "Applicati id DOM + className selezione alla riga cliccabile." -ForegroundColor Green
  } else {
    Write-Host "Non applico id/className: o ancora diversa o già presente." -ForegroundColor DarkYellow
  }

  # 4) Inserisci pannello destro (ancora: selected && ()
  $txt = Read-Text $page
  if (-not $txt.Contains("Articolo selezionato") -and $txt.Contains("selected && (")) {
    $needle3 = "selected && ("
    $rep3 = @"
selected && (
          <>
            <div className="mb-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Articolo selezionato</div>
              <div className="mt-1 text-lg font-semibold text-neutral-900">
                {(selected as any)?.nome ?? (selected as any)?.name ?? "—"}
                {((selected as any)?.codice ?? (selected as any)?.code) ? ` (${(selected as any).codice ?? (selected as any).code})` : ""}
              </div>
            </div>

            <div className="mb-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Scatole</div>
              <div className="mt-2 grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-neutral-200 p-3">
                  <div className="text-xs text-neutral-500">Totale (da pezzi)</div>
                  <div className="mt-1 text-xl font-semibold">{calcScatoleTotali(selected)}</div>
                </div>
                <div className="rounded-xl border border-neutral-200 p-3">
                  <div className="text-xs text-neutral-500">Impegnate</div>
                  <div className="mt-1 text-xl font-semibold">{getScatoleImpegnate(selected)}</div>
                </div>
                <div className="rounded-xl border border-neutral-200 p-3">
                  <div className="text-xs text-neutral-500">Disponibili</div>
                  <div className="mt-1 text-xl font-semibold">{calcScatoleDisponibili(selected)}</div>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold hover:bg-neutral-50"
                  onClick={async () => {
                    const raw = window.prompt("Quante scatole vuoi impegnare?", "1")
                    if (raw === null) return
                    const n = Math.max(0, Math.floor(Number(raw) || 0))
                    if (n <= 0) return

                    const disponibili = calcScatoleDisponibili(selected)
                    if (n > disponibili) {
                      window.alert(`Scatole disponibili insufficienti.\nDisponibili: ${disponibili}\nRichieste: ${n}`)
                      return
                    }

                    const ok = window.confirm(`Confermi di impegnare ${n} scatole?`)
                    if (!ok) return
                    await setScatoleImpegnate(getScatoleImpegnate(selected) + n)
                  }}
                >
                  + Impegna scatole
                </button>

                <button
                  type="button"
                  className="flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold hover:bg-neutral-50"
                  onClick={async () => {
                    const raw = window.prompt("Quante scatole vuoi liberare?", "1")
                    if (raw === null) return
                    const n = Math.max(0, Math.floor(Number(raw) || 0))
                    if (n <= 0) return

                    const impegnate = getScatoleImpegnate(selected)
                    if (n > impegnate) {
                      window.alert(`Non puoi liberare più di quelle impegnate.\nImpegnate: ${impegnate}\nRichieste: ${n}`)
                      return
                    }

                    const ok = window.confirm(`Confermi di liberare ${n} scatole?`)
                    if (!ok) return
                    await setScatoleImpegnate(impegnate - n)
                  }}
                >
                  - Libera scatole
                </button>
              </div>
            </div>
"@
    Replace-Once $page $needle3 $rep3
    Write-Host "Inseriti riquadro selezione + pannello scatole." -ForegroundColor Green
  } else {
    Write-Host "Pannello selezione/scatole già presente o ancora mancante: salto." -ForegroundColor DarkYellow
  }

  Write-Host "Eseguo build..." -ForegroundColor Cyan
  npm run build

  git add -A
  git commit -m "UX: highlight selected; add scatole impegnate with confirmations"
  git push

  Write-Host "Fatto: build OK + push." -ForegroundColor Green
}
catch {
  Write-Host ("ERRORE: {0}" -f $_.Exception.Message) -ForegroundColor Red
  Write-Host "Rollback in corso..." -ForegroundColor Yellow
  Restore-Backup $backup
  Write-Host "Rollback completato." -ForegroundColor Yellow
  throw
}
