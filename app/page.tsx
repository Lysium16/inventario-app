"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Tab = "magazzino" | "ordini" | "arrivi" | "dashboard";

type Articolo = {
  id: string;
  cod_articolo: string;       // usato come "misura/codice"
  descrizione: string;
  pz_per_scatola: number;
  scatole_inventario: number;

  // extra (possono esistere o no: gestiamo fallback)
  scatole_impegnate?: number; // riservate / da tenere a mente
  in_arrivo?: number;
  scorta_minima?: number;
  scorta_obiettivo?: number;
  prezzo_costo?: number;
  visibile_magazzino?: boolean;

  created_at?: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

// ===== Brand / UI =====
const ACCENT = "#2CB8B3"; // verde acqua (puoi cambiarlo qui)
const MIN_ORDER_EUR = 1000;

function clampInt(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function fmtEur(v: number) {
  try {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
  } catch {
    return `€ ${(v || 0).toFixed(2)}`;
  }
}

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pezziTotaliFisici(a: Articolo) {
  return clampInt(safeNum(a.scatole_inventario)) * clampInt(safeNum(a.pz_per_scatola));
}

function disponibili(a: Articolo) {
  const fisiche = clampInt(safeNum(a.scatole_inventario));
  const imp = clampInt(safeNum(a.scatole_impegnate));
  return Math.max(0, fisiche - imp);
}

function statoScorta(a: Articolo) {
  const disp = disponibili(a);
  const min = clampInt(safeNum(a.scorta_minima));
  if (disp <= 0) return "critico";
  if (min > 0 && disp <= min) return "basso";
  return "ok";
}

// PDF semplice: MISURA (cod_articolo), DESCRIZIONE, PEZZI
function exportOrdinePdf(articoli: Articolo[], carrello: Record<string, number>) {
  const rows: Array<[string, string, string]> = [];

  for (const [id, scatole] of Object.entries(carrello || {})) {
    const qScatole = clampInt(Number(scatole));
    if (qScatole <= 0) continue;

    const a = articoli.find((x) => x.id === id);
    if (!a) continue;

    const misura = (a.cod_articolo || "").trim();
    const descr = (a.descrizione || "").trim();
    const pezzi = qScatole * clampInt(safeNum(a.pz_per_scatola));

    rows.push([misura, descr, String(pezzi)]);
  }

  // import dinamico per evitare peso in build
  import("jspdf").then(({ jsPDF }) => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    const margin = 40;
    const top = 50;
    let y = top;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Elenco ordine borse in carta", margin, y);

    y += 20;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Data: ${new Date().toLocaleString("it-IT")}`, margin, y);
    y += 20;

    // intestazione tabella
    doc.setFont("helvetica", "bold");
    doc.text("Misura", margin, y);
    doc.text("Descrizione", margin + 130, y);
    doc.text("Pezzi", 520, y, { align: "right" });
    y += 10;
    doc.setDrawColor(200);
    doc.line(margin, y, 555, y);
    y += 14;

    doc.setFont("helvetica", "normal");

    const maxY = 800;

    for (const r of rows) {
      const [misura, descr, pezzi] = r;

      const descrLines = doc.splitTextToSize(descr, 350);
      const h = Math.max(14, descrLines.length * 12);

      if (y + h > maxY) {
        doc.addPage();
        y = top;
      }

      doc.text(misura || "-", margin, y);
      doc.text(descrLines, margin + 130, y);
      doc.text(pezzi, 520, y, { align: "right" });

      y += h + 6;
    }

    doc.save("ordine-borse-in-carta.pdf");
  });
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("magazzino");
  const [loading, setLoading] = useState(true);
  const [articoli, setArticoli] = useState<Articolo[]>([]);
  const [query, setQuery] = useState("");

  // semplice / avanzato
  const [simpleView, setSimpleView] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // selezione
  const [selected, setSelected] = useState<Articolo | null>(null);

  // delta (carico/scarico fisico)
  const [deltaFisico, setDeltaFisico] = useState("");

  // impegnate (con pulsante applica e reset)
  const [deltaImp, setDeltaImp] = useState("");

  // campi "avanzati" (meno cliccabili per sbaglio: li mettiamo in impostazioni)
  const [editCosto, setEditCosto] = useState("");
  const [editMin, setEditMin] = useState("");
  const [editObj, setEditObj] = useState("");
  const [editVis, setEditVis] = useState(true);

  // ordini
  const [carrello, setCarrello] = useState<Record<string, number>>({});
  const [suggeriti, setSuggeriti] = useState<Array<{ a: Articolo; qta: number }>>([]);

  async function loadArticoli() {
    setLoading(true);
    const { data, error } = await supabase
      .from("articoli")
      .select("*")
      .order("descrizione", { ascending: true });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    const list = (data || []) as Articolo[];
    setArticoli(list);
    setLoading(false);
  }

  useEffect(() => {
    loadArticoli();
  }, []);

  // quando cambi selected aggiorna campi avanzati
  useEffect(() => {
    if (!selected) return;
    setEditCosto(String(safeNum(selected.prezzo_costo ?? 0)).replace(".", ","));
    setEditMin(String(clampInt(safeNum(selected.scorta_minima ?? 0))));
    setEditObj(String(clampInt(safeNum(selected.scorta_obiettivo ?? 0))));
    setEditVis(selected.visibile_magazzino !== false);
  }, [selected?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = [...articoli].sort((a, b) =>
      (a.descrizione || "").localeCompare(b.descrizione || "", "it", { sensitivity: "base" })
    );
    if (!q) return base;
    return base.filter((a) => {
      return (
        (a.cod_articolo || "").toLowerCase().includes(q) ||
        (a.descrizione || "").toLowerCase().includes(q)
      );
    });
  }, [articoli, query]);

  const soloMagazzino = useMemo(() => {
    return filtered.filter((a) => a.visibile_magazzino !== false);
  }, [filtered]);

  const criticiCount = useMemo(() => {
    return soloMagazzino.filter((a) => statoScorta(a) === "critico").length;
  }, [soloMagazzino]);

  function topBarSubtitle() {
    if (tab === "magazzino") return `${criticiCount} articoli critici`;
    if (tab === "ordini") return `Totale ordine: ${fmtEur(totaleCarrello())}`;
    if (tab === "arrivi") return `In arrivo: ${inArrivoTot()} scatole`;
    return "Solo per te: numeri e priorità";
  }

  async function updateSelected(patch: Partial<Articolo>) {
    if (!selected) return;

    const { error } = await supabase
      .from("articoli")
      .update(patch)
      .eq("id", selected.id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadArticoli();
    // ripesca la selected aggiornata
    const fresh = articoli.find((x) => x.id === selected.id);
    setSelected(fresh || null);
  }

  async function applyDeltaFisico(sign: "+" | "-") {
    if (!selected) return;

    const n = clampInt(parseInt(deltaFisico, 10));
    if (!Number.isFinite(n) || n <= 0) return alert("Inserisci una quantità valida.");

    const current = clampInt(safeNum(selected.scatole_inventario));
    const next = sign === "+" ? current + n : current - n;
    if (next < 0) return alert("Non puoi andare sotto zero.");

    const { error } = await supabase
      .from("articoli")
      .update({ scatole_inventario: next })
      .eq("id", selected.id);

    if (error) return alert(error.message);

    setDeltaFisico("");
    await loadArticoli();
  }

  async function applyDeltaImpegnate(sign: "+" | "-") {
    if (!selected) return;

    const n = clampInt(parseInt(deltaImp, 10));
    if (!Number.isFinite(n) || n <= 0) return alert("Inserisci una quantità valida.");

    const current = clampInt(safeNum(selected.scatole_impegnate ?? 0));
    const next = sign === "+" ? current + n : current - n;
    if (next < 0) return alert("Non puoi andare sotto zero.");

    const { error } = await supabase
      .from("articoli")
      .update({ scatole_impegnate: next })
      .eq("id", selected.id);

    if (error) return alert(error.message);

    // IMPORTANT: svuota sempre campo dopo applica
    setDeltaImp("");
    await loadArticoli();
  }

  function setCarrelloQty(id: string, qta: number) {
    const x = clampInt(qta);
    setCarrello((prev) => {
      const next = { ...prev };
      if (x <= 0) delete next[id];
      else next[id] = x;
      return next;
    });
  }

  function totaleCarrello() {
    let tot = 0;
    for (const [id, qta] of Object.entries(carrello)) {
      const a = articoli.find((x) => x.id === id);
      if (!a) continue;
      tot += clampInt(Number(qta)) * safeNum(a.prezzo_costo ?? 0);
    }
    return tot;
  }

  function inArrivoTot() {
    return articoli.reduce((acc, a) => acc + clampInt(safeNum(a.in_arrivo ?? 0)), 0);
  }

  function suggerisciOrdine() {
    const list: Array<{ a: Articolo; qta: number }> = [];

    for (const a of articoli) {
      if (a.visibile_magazzino === false) continue; // roba solo tua non intasa
      const obj = clampInt(safeNum(a.scorta_obiettivo ?? 0));
      if (obj <= 0) continue;

      const disp = disponibili(a);
      const inArr = clampInt(safeNum(a.in_arrivo ?? 0));
      const target = obj;

      // quante scatole servono per tornare all'obiettivo considerando già in arrivo
      const need = Math.max(0, target - (disp + inArr));
      if (need > 0) list.push({ a, qta: need });
    }

    // ordina: prima critici poi deficit maggiori
    list.sort((x, y) => {
      const sx = statoScorta(x.a);
      const sy = statoScorta(y.a);
      const w = (s: string) => (s === "critico" ? 0 : s === "basso" ? 1 : 2);
      if (w(sx) !== w(sy)) return w(sx) - w(sy);
      return y.qta - x.qta;
    });

    setSuggeriti(list);
  }

  const righeCarrello = useMemo(() => {
    const rows: Array<{ a: Articolo; qta: number }> = [];
    for (const [id, qta] of Object.entries(carrello)) {
      const a = articoli.find((x) => x.id === id);
      if (!a) continue;
      rows.push({ a, qta: clampInt(Number(qta)) });
    }
    rows.sort((x, y) => (x.a.descrizione || "").localeCompare(y.a.descrizione || "", "it", { sensitivity: "base" }));
    return rows;
  }, [carrello, articoli]);

  // ===== UI =====
  function TopTabs() {
    return (
      <div className="flex items-center gap-2">
        {([
          ["magazzino", "Magazzino"],
          ["ordini", "Ordini"],
          ["arrivi", "Arrivi"],
          ["dashboard", "Dashboard"],
        ] as Array<[Tab, string]>).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-2xl px-3 py-2 text-sm font-semibold transition ${
              tab === k ? "text-white" : "text-neutral-700 hover:bg-neutral-100"
            }`}
            style={tab === k ? { backgroundColor: ACCENT } : undefined}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }

  function cardClass(a: Articolo) {
    const s = statoScorta(a);
    if (s === "critico") return "card-critico";
    if (s === "basso") return "card-basso";
    return "";
  }

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-32 overflow-hidden rounded-xl bg-white">
              <img src="/domobags-logo.png" alt="Logo" className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight text-neutral-900">
                Magazzino
              </div>
              <div className="text-xs text-neutral-500">{topBarSubtitle()}</div>
            </div>
          </div>

          <TopTabs />
        </div>

        {tab === "magazzino" && (
          <div className="mx-auto max-w-6xl px-4 pb-3">
            <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "rgba(44,184,179,0.35)", background: "rgba(44,184,179,0.06)" }}>
              <div className="font-semibold text-neutral-900">Nota per la diabolica mamma</div>
              <div className="text-neutral-700">
                È talmente semplice che anche tu riesci a usarlo. Se sbagli… è volontà divina, non colpa del programma.
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-neutral-600">
                  Modalità semplice: mostra solo disponibilità e pulsanti essenziali.
                </div>
                <button
                  onClick={() => { setSimpleView((v) => !v); setShowAdvanced(false); }}
                  className="rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow-sm"
                  style={{ backgroundColor: ACCENT }}
                >
                  {simpleView ? "Passa ad Avanzato" : "Passa a Semplice"}
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Ricerca */}
        {tab !== "dashboard" && (
          <div className="mb-4">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca per misura/codice o descrizione…"
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-neutral-400"
            />
          </div>
        )}

        {/* MAGAZZINO */}
        {tab === "magazzino" && (
          <div className="grid gap-4 md:grid-cols-2">
            {/* Lista */}
            <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">Articoli</h2>
                <span className="text-xs text-neutral-500">{loading ? "…" : `${soloMagazzino.length} tot`}</span>
              </div>

              {loading ? (
                <p className="text-sm text-neutral-500">Caricamento…</p>
              ) : soloMagazzino.length === 0 ? (
                <p className="text-sm text-neutral-500">Nessun articolo trovato.</p>
              ) : (
                <div className="space-y-2">
                  {soloMagazzino.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setSelected(a)}
                      className={`w-full rounded-2xl border px-3 py-3 text-left transition ${cardClass(a)} ${
                        selected?.id === a.id ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 bg-white hover:bg-neutral-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">{a.descrizione}</div>
                          <div className="text-xs text-neutral-500">{a.cod_articolo}</div>
                        </div>

                        <div className="text-right">
                          <div className="text-lg font-semibold">{disponibili(a)}</div>
                          <div className="text-xs text-neutral-500">disponibili</div>
                        </div>
                      </div>

                      <div className="mt-2 text-xs text-neutral-500">
                        Fisico: {a.scatole_inventario} • Impegnate: {clampInt(safeNum(a.scatole_impegnate ?? 0))} • {pezziTotaliFisici(a)} pz fisici
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Dettaglio */}
            <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-base font-semibold">Dettaglio</h2>

              {!selected ? (
                <p className="text-sm text-neutral-500">Seleziona un articolo dalla lista.</p>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                    <div className="text-sm font-semibold">{selected.descrizione}</div>
                    <div className="text-xs text-neutral-500">{selected.cod_articolo}</div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-2xl bg-white p-3">
                        <div className="text-xs text-neutral-500">Disponibili</div>
                        <div className="text-xl font-semibold">{disponibili(selected)}</div>
                      </div>
                      <div className="rounded-2xl bg-white p-3">
                        <div className="text-xs text-neutral-500">Fisico</div>
                        <div className="text-xl font-semibold">{clampInt(safeNum(selected.scatole_inventario))}</div>
                      </div>
                    </div>

                    <div className="mt-3 text-xs text-neutral-500">
                      {selected.pz_per_scatola} pz/scatola • Impegnate: {clampInt(safeNum(selected.scatole_impegnate ?? 0))} • In arrivo: {clampInt(safeNum(selected.in_arrivo ?? 0))}
                    </div>
                  </div>

                  {/* Carico/Scarico fisico */}
                  <div className="rounded-2xl border border-neutral-200 p-3">
                    <label className="block text-xs text-neutral-500">Carico / Scarico (fisico)</label>
                    <input
                      value={deltaFisico}
                      onChange={(e) => setDeltaFisico(e.target.value.replace(/[^\d]/g, ""))}
                      inputMode="numeric"
                      placeholder="es. 2"
                      className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-neutral-400"
                    />

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => applyDeltaFisico("+")}
                        className="rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
                        style={{ backgroundColor: ACCENT }}
                      >
                        + Carico
                      </button>
                      <button
                        onClick={() => applyDeltaFisico("-")}
                        className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 shadow-sm active:scale-[0.99]"
                      >
                        − Scarico
                      </button>
                    </div>
                  </div>

                  {/* Impegnate */}
                  <div className="rounded-2xl border border-neutral-200 p-3">
                    <label className="block text-xs text-neutral-500">Scatole impegnate (promemoria ordini)</label>
                    <input
                      value={deltaImp}
                      onChange={(e) => setDeltaImp(e.target.value.replace(/[^\d]/g, ""))}
                      inputMode="numeric"
                      placeholder="es. 5"
                      className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-neutral-400"
                    />

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => applyDeltaImpegnate("+")}
                        className="rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
                        style={{ backgroundColor: ACCENT }}
                      >
                        + Applica
                      </button>
                      <button
                        onClick={() => applyDeltaImpegnate("-")}
                        className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 shadow-sm active:scale-[0.99]"
                      >
                        − Applica
                      </button>
                    </div>

                    {!simpleView && (
                      <button
                        onClick={() => setShowAdvanced((v) => !v)}
                        className="mt-3 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 shadow-sm hover:bg-neutral-50"
                      >
                        {showAdvanced ? "Nascondi impostazioni" : "Impostazioni (avanzate)"}
                      </button>
                    )}

                    {!simpleView && showAdvanced && (
                      <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-3 space-y-3">
                        <div className="grid gap-2 md:grid-cols-2">
                          <div>
                            <div className="text-sm font-semibold">Costo (€/scatola)</div>
                            <div className="mt-2 flex gap-2">
                              <input
                                value={editCosto}
                                onChange={(e) => setEditCosto(e.target.value.replace(/[^\d.,]/g, ""))}
                                inputMode="decimal"
                                className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-neutral-400"
                              />
                              <button
                                onClick={() => { updateSelected({ prezzo_costo: parseFloat((editCosto || "0").replace(",", ".")) }); setEditCosto(""); }}
                                className="shrink-0 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm"
                                style={{ backgroundColor: ACCENT }}
                              >
                                Applica
                              </button>
                            </div>
                          </div>

                          <div>
                            <div className="text-sm font-semibold">Scorta minima</div>
                            <div className="mt-2 flex gap-2">
                              <input
                                value={editMin}
                                onChange={(e) => setEditMin(e.target.value.replace(/[^\d]/g, ""))}
                                inputMode="numeric"
                                className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-neutral-400"
                              />
                              <button
                                onClick={() => { updateSelected({ scorta_minima: parseInt(editMin || "0", 10) }); setEditMin(""); }}
                                className="shrink-0 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm"
                                style={{ backgroundColor: ACCENT }}
                              >
                                Applica
                              </button>
                            </div>
                          </div>

                          <div>
                            <div className="text-sm font-semibold">Scorta obiettivo (ordini)</div>
                            <div className="mt-2 flex gap-2">
                              <input
                                value={editObj}
                                onChange={(e) => setEditObj(e.target.value.replace(/[^\d]/g, ""))}
                                inputMode="numeric"
                                className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-neutral-400"
                              />
                              <button
                                onClick={() => { updateSelected({ scorta_obiettivo: parseInt(editObj || "0", 10) }); setEditObj(""); }}
                                className="shrink-0 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm"
                                style={{ backgroundColor: ACCENT }}
                              >
                                Applica
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-3">
                            <div>
                              <div className="text-sm font-semibold">Visibile in Magazzino</div>
                              <div className="text-xs text-neutral-500">Se disattivi, resta solo per te (Ordini)</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={editVis}
                              onChange={(e) => {
                                const v = e.target.checked;
                                setEditVis(v);
                                updateSelected({ visibile_magazzino: v });
                              }}
                              className="h-5 w-5"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ORDINI */}
        {tab === "ordini" && (
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">Suggeriti</h2>
                <button
                  onClick={suggerisciOrdine}
                  className="rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow-sm"
                  style={{ backgroundColor: ACCENT }}
                >
                  Suggerisci ordini
                </button>
              </div>

              {suggeriti.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  Nessun suggerimento (serve impostare una “scorta obiettivo” negli articoli).
                </p>
              ) : (
                <div className="space-y-2">
                  {suggeriti.map(({ a, qta }) => (
                    <div key={a.id} className={`rounded-2xl border border-neutral-200 p-3 ${cardClass(a)}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">{a.descrizione}</div>
                          <div className="text-xs text-neutral-500">{a.cod_articolo}</div>
                          <div className="mt-1 text-xs text-neutral-500">
                            Disponibili: {disponibili(a)} • In arrivo: {clampInt(safeNum(a.in_arrivo ?? 0))} • Obiettivo: {clampInt(safeNum(a.scorta_obiettivo ?? 0))}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold">{qta}</div>
                          <div className="text-xs text-neutral-500">scatole</div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="text-xs text-neutral-500">
                          Costo stimato: {fmtEur(qta * safeNum(a.prezzo_costo ?? 0))}
                        </div>
                        <button
                          onClick={() => setCarrelloQty(a.id, qta)}
                          className="rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow-sm"
                          style={{ backgroundColor: ACCENT }}
                        >
                          Aggiungi all’ordine
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">Carrello ordine</h2>
                <button
                  onClick={() => exportOrdinePdf(articoli, carrello)}
                  className="rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow-sm"
                  style={{ backgroundColor: ACCENT }}
                >
                  Esporta PDF
                </button>
              </div>

              {righeCarrello.length === 0 ? (
                <p className="text-sm text-neutral-500">Carrello vuoto.</p>
              ) : (
                <div className="space-y-2">
                  {righeCarrello.map(({ a, qta }) => (
                    <div key={a.id} className="rounded-2xl border border-neutral-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">{a.descrizione}</div>
                          <div className="text-xs text-neutral-500">{a.cod_articolo}</div>
                          <div className="mt-1 text-xs text-neutral-500">
                            {qta} scatole • {qta * clampInt(safeNum(a.pz_per_scatola))} pezzi
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold">{fmtEur(qta * safeNum(a.prezzo_costo ?? 0))}</div>
                          <div className="text-xs text-neutral-500">stimato</div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="text-xs text-neutral-500">
                          Modifica quantità (scatole)
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCarrelloQty(a.id, qta - 1)}
                            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold"
                          >
                            −
                          </button>
                          <div className="min-w-[48px] text-center text-sm font-semibold">{qta}</div>
                          <button
                            onClick={() => setCarrelloQty(a.id, qta + 1)}
                            className="rounded-xl px-3 py-2 text-sm font-semibold text-white"
                            style={{ backgroundColor: ACCENT }}
                          >
                            +
                          </button>
                          <button
                            onClick={() => setCarrelloQty(a.id, 0)}
                            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-600"
                          >
                            Rimuovi
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Totale stimato</div>
                  <div className="text-sm font-semibold">{fmtEur(totaleCarrello())}</div>
                </div>
                {totaleCarrello() < MIN_ORDER_EUR && (
                  <div className="mt-2 text-sm" style={{ color: "#b45309" }}>
                    Attenzione: sotto il minimo ordine di {fmtEur(MIN_ORDER_EUR)}.
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* ARRIVI (placeholder elegante, logica completa la facciamo nel blocco 2) */}
        {tab === "arrivi" && (
          <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">Arrivi</h2>
            <p className="text-sm text-neutral-500">
              Qui gestiamo le scatole “in arrivo”: quando arrivano, un tasto le sposta nel fisico automaticamente.
            </p>
            <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
              (Arrivi verrà completato nel prossimo blocco.)
            </div>
          </section>
        )}

        {/* DASHBOARD (placeholder, dati nel blocco 2) */}
        {tab === "dashboard" && (
          <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">Dashboard (solo per te)</h2>
            <p className="text-sm text-neutral-500">
              Qui mettiamo: valore magazzino, valore disponibili, top critici, trend ordini.
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                <div className="text-xs text-neutral-500">Valore magazzino (fisico)</div>
                <div className="text-xl font-semibold">{fmtEur(0)}</div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                <div className="text-xs text-neutral-500">Valore disponibili</div>
                <div className="text-xl font-semibold">{fmtEur(0)}</div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                <div className="text-xs text-neutral-500">Critici</div>
                <div className="text-xl font-semibold">{criticiCount}</div>
              </div>
            </div>
            <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
              (Dashboard verrà completata nel prossimo blocco.)
            </div>
          </section>
        )}
      </div>

      <style jsx global>{`
        .card-critico {
          border-color: rgba(239, 68, 68, 0.35) !important;
          box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.12) inset;
          background: linear-gradient(180deg, rgba(254, 242, 242, 0.7), rgba(255, 255, 255, 1));
        }
        .card-basso {
          border-color: rgba(249, 115, 22, 0.28) !important;
          box-shadow: 0 0 0 1px rgba(249, 115, 22, 0.10) inset;
          background: linear-gradient(180deg, rgba(255, 247, 237, 0.75), rgba(255, 255, 255, 1));
        }
      `}</style>
    </main>
  );
}
