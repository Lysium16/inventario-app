"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Articolo = {
  id: string;
  cod_articolo: string;
  descrizione: string;
  pz_per_scatola: number;
  scatole_inventario: number;
  scatole_impegnate: number;
  in_arrivo: number;
  scorta_minima: number;
  scorta_obiettivo: number;
  prezzo_costo: number;
  visibile_magazzino: boolean;
  created_at: string;
};

type Ordine = {
  id: string;
  created_at: string;
  note: string;
  totale: number;
  stato: "APERTO" | "RICEVUTO";
};

type RigaOrdine = {
  id: string;
  ordine_id: string;
  articolo_id: string;
  descrizione: string;
  cod_articolo: string;
  qta: number;
  prezzo_costo: number;
  arrived: boolean;
  arrived_at: string | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const MIN_ORDINE_EUR = 500;

function fmtInt(n: number) {
  return new Intl.NumberFormat("it-IT").format(n || 0);
}
function fmtEur(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n || 0);
}
function clamp0(n: number) {
  return n < 0 ? 0 : n;
}
function disponibili(a: Articolo) {
  return clamp0((a.scatole_inventario || 0) - (a.scatole_impegnate || 0));
}
function copertura(a: Articolo) {
  return disponibili(a) + (a.in_arrivo || 0);
}
function daOrdinareConsigliato(a: Articolo) {
  const target = a.scorta_obiettivo || 0;
  const cop = copertura(a);
  return clamp0(target - cop);
}
function statoScorte(a: Articolo) {
  const disp = disponibili(a);
  const min = a.scorta_minima || 0;
  if (disp <= min) return { k: "critico" as const, label: "Critico", pill: "bg-red-100 text-red-700 border-red-200", card: "card-critico" };
  if (disp <= min + 3) return { k: "basso" as const, label: "Basso", pill: "bg-orange-100 text-orange-800 border-orange-200", card: "card-basso" };
  return { k: "ok" as const, label: "OK", pill: "brand-pill", card: "" };
}
function prio(a: Articolo) {
  const k = statoScorte(a).k;
  return k === "critico" ? 0 : k === "basso" ? 1 : 2;
}

type Tab = "magazzino" | "ordini" | "arrivi";

export default function Page() {
  const [tab, setTab] = useState<Tab>("magazzino");

  const [loading, setLoading] = useState(true);
  const [articoli, setArticoli] = useState<Articolo[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Articolo | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const [flash, setFlash] = useState<null | "green" | "red">(null);

  // Magazzino: carico/scarico
  const [delta, setDelta] = useState("");

  // Dettaglio: campi (min, impegnate, obiettivo, costo, visibile)
  const [editMin, setEditMin] = useState("");
  const [editImp, setEditImp] = useState("");
  const [editObj, setEditObj] = useState("");
  const [editCosto, setEditCosto] = useState("");
  const [editVis, setEditVis] = useState(true);

  // Ordini
  const [carrello, setCarrello] = useState<Record<string, number>>({});
  const [ordineNote, setOrdineNote] = useState("");
  const [ordini, setOrdini] = useState<Ordine[]>([]);
  const [righeAperte, setRigheAperte] = useState<RigaOrdine[]>([]);
  const [arriviSel, setArriviSel] = useState<Record<string, boolean>>({});

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1600);
  }
  async function flashOK(sign: "+" | "-") {
    setFlash(sign === "+" ? "green" : "red");
    window.setTimeout(() => setFlash(null), 220);
  }

  async function loadArticoli() {
    setLoading(true);
    const { data, error } = await supabase.from("articoli").select("*");
    if (error) {
      alert(error.message);
      setLoading(false);
      return [] as Articolo[];
    }
    const list = (data || []) as Articolo[];
    setArticoli(list);
    setLoading(false);
    return list;
  }

  async function loadOrdiniEAperti() {
    const { data: o, error: e1 } = await supabase.from("ordini").select("*").order("created_at", { ascending: false });
    if (e1) return alert(e1.message);
    setOrdini((o || []) as Ordine[]);

    // righe non arrivate (arrivi)
    const { data: r, error: e2 } = await supabase
      .from("righe_ordine")
      .select("*")
      .eq("arrived", false)
      .order("created_at", { ascending: false });
    if (e2) return alert(e2.message);
    setRigheAperte((r || []) as RigaOrdine[]);
  }

  useEffect(() => {
    (async () => {
      await loadArticoli();
      await loadOrdiniEAperti();
    })();
  }, []);

  useEffect(() => {
    if (!selected) return;
    const fresh = articoli.find((a) => a.id === selected.id);
    if (!fresh) return;
    setSelected(fresh);
    setEditMin(String(fresh.scorta_minima ?? 0));
    setEditImp(String(fresh.scatole_impegnate ?? 0));
    setEditObj(String(fresh.scorta_obiettivo ?? 0));
    setEditCosto(String(fresh.prezzo_costo ?? 0));
    setEditVis(!!fresh.visibile_magazzino);
  }, [articoli]); // eslint-disable-line react-hooks/exhaustive-deps

  const listMagazzino = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articoli
      .filter((a) => a.visibile_magazzino !== false)
      .filter((a) => !q || a.cod_articolo.toLowerCase().includes(q) || a.descrizione.toLowerCase().includes(q))
      .sort((a, b) => {
        const pa = prio(a), pb = prio(b);
        if (pa !== pb) return pa - pb;
        return a.descrizione.localeCompare(b.descrizione, "it", { sensitivity: "base" });
      });
  }, [articoli, query]);

  const criticiCount = useMemo(() => listMagazzino.filter((a) => statoScorte(a).k === "critico").length, [listMagazzino]);

  // Suggerimento ordine: usa SOLO articoli “ordinabili” = qui per semplicità: quelli NON visibili magazzino (puoi cambiarlo dopo)
  // + in realtà include anche quelli visibili se vuoi: io li includo tutti, ma mostro una sezione "Ordine (tu)" filtrabile.
  const suggeriti = useMemo(() => {
    return articoli
      .map((a) => ({ a, qta: daOrdinareConsigliato(a) }))
      .filter((x) => x.qta > 0)
      .sort((x, y) => y.qta - x.qta);
  }, [articoli]);

  const totaleCarrello = useMemo(() => {
    let tot = 0;
    for (const [id, qta] of Object.entries(carrello)) {
      if (!qta) continue;
      const a = articoli.find((x) => x.id === id);
      if (!a) continue;
      tot += (qta || 0) * (Number(a.prezzo_costo) || 0);
    }
    return tot;
  }, [carrello, articoli]);

  function setCart(id: string, q: number) {
    setCarrello((prev) => {
      const next = { ...prev };
      if (!q || q <= 0) delete next[id];
      else next[id] = q;
      return next;
    });
  }

  async function updateSelected(patch: Partial<Articolo>) {
    if (!selected) return;
    const { error } = await supabase.from("articoli").update(patch).eq("id", selected.id);
    if (error) return alert(error.message);
    showToast("Salvato");
    await loadArticoli();
  }

  async function applyDelta(sign: "+" | "-") {
    if (!selected) return;
    const n = parseInt(delta, 10);
    if (!Number.isFinite(n) || n <= 0) return alert("Inserisci una quantità valida.");

    const current = selected.scatole_inventario || 0;
    const next = sign === "+" ? current + n : current - n;
    if (next < 0) return alert("Non puoi andare sotto zero.");

    const { error } = await supabase.from("articoli").update({ scatole_inventario: next }).eq("id", selected.id);
    if (error) return alert(error.message);

    setDelta("");
    await flashOK(sign);
    showToast(sign === "+" ? "Carico registrato" : "Scarico registrato");
    await loadArticoli();
  }

  async function confermaOrdine() {
    const entries = Object.entries(carrello).filter(([, q]) => q && q > 0);
    if (entries.length === 0) return alert("Carrello vuoto.");
    // crea ordine
    const { data: ord, error: e1 } = await supabase
      .from("ordini")
      .insert({ note: ordineNote || "", totale: totaleCarrello, stato: "APERTO" })
      .select("*")
      .single();
    if (e1) return alert(e1.message);

    const ordine = ord as Ordine;

    // crea righe e aggiorna in_arrivo
    for (const [articolo_id, qta] of entries) {
      const a = articoli.find((x) => x.id === articolo_id);
      if (!a) continue;
      const prezzo = Number(a.prezzo_costo) || 0;

      const { error: eR } = await supabase.from("righe_ordine").insert({
        ordine_id: ordine.id,
        articolo_id,
        descrizione: a.descrizione,
        cod_articolo: a.cod_articolo,
        qta,
        prezzo_costo: prezzo,
      });
      if (eR) return alert(eR.message);

      const nextArrivo = (a.in_arrivo || 0) + qta;
      const { error: eA } = await supabase.from("articoli").update({ in_arrivo: nextArrivo }).eq("id", articolo_id);
      if (eA) return alert(eA.message);
    }

    showToast("Ordine confermato (in arrivo aggiornato)");
    setCarrello({});
    setOrdineNote("");
    await loadArticoli();
    await loadOrdiniEAperti();
    setTab("arrivi");
  }

  async function riceviSelezionati() {
    const toReceive = righeAperte.filter((r) => arriviSel[r.id]);
    if (toReceive.length === 0) return alert("Seleziona almeno una riga.");

    for (const r of toReceive) {
      const a = articoli.find((x) => x.id === r.articolo_id);
      if (!a) continue;

      const q = r.qta || 0;
      const nextMag = (a.scatole_inventario || 0) + q;
      const nextArr = clamp0((a.in_arrivo || 0) - q);

      const { error: e1 } = await supabase.from("articoli").update({ scatole_inventario: nextMag, in_arrivo: nextArr }).eq("id", a.id);
      if (e1) return alert(e1.message);

      const { error: e2 } = await supabase
        .from("righe_ordine")
        .update({ arrived: true, arrived_at: new Date().toISOString() })
        .eq("id", r.id);
      if (e2) return alert(e2.message);
    }

    setArriviSel({});
    showToast("Arrivo registrato (magazzino aggiornato)");
    await loadArticoli();
    await loadOrdiniEAperti();
  }

  function TopTabs() {
    const btn = (k: Tab, label: string) => (
      <button
        onClick={() => setTab(k)}
        className={[
          "rounded-2xl border px-3 py-2 text-sm shadow-sm",
          tab === k ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
        ].join(" ")}
      >
        {label}
      </button>
    );
    return (
      <div className="flex gap-2">
        {btn("magazzino", "Magazzino")}
        {btn("ordini", "Ordini")}
        {btn("arrivi", "Arrivi")}
      </div>
    );
  }

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-neutral-50 to-neutral-100 text-neutral-900">
      {flash && (
        <div
          className={[
            "pointer-events-none absolute inset-0 z-50",
            flash === "green" ? "bg-green-200/28" : "bg-red-200/28",
            "animate-[flash_220ms_ease-out_1]",
          ].join(" ")}
        />
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-neutral-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <header className="sticky top-0 z-20 border-b border-neutral-200/60 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-9 w-24 shrink-0 overflow-hidden rounded-xl bg-white">
              <img src="/domobags-logo.png" alt="Domobags" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold tracking-tight">Magazzino Domobags</div>
              <div className="text-xs text-neutral-500">
                {tab === "magazzino" && (loading ? "…" : `${listMagazzino.length} articoli • ${criticiCount} critici`)}
                {tab === "ordini" && `Suggeriti: ${suggeriti.length} • Totale carrello: ${fmtEur(totaleCarrello)}`}
                {tab === "arrivi" && `Righe da ricevere: ${righeAperte.length}`}
              </div>
            </div>
          </div>

          <TopTabs />
        </div>

        {tab === "magazzino" && (
          <div className="mx-auto max-w-6xl px-4 pb-3">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cerca per codice o descrizione…"
                className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 pr-10 text-base shadow-sm outline-none focus:border-neutral-400"
              />
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">⌕</div>
            </div>
          </div>
        )}
      </header>

      <div className="mx-auto max-w-6xl px-4 py-4">
        {tab === "magazzino" && (
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-3xl border border-neutral-200 bg-white p-3 shadow-sm">
              {loading ? (
                <div className="p-3 text-sm text-neutral-500">Caricamento…</div>
              ) : listMagazzino.length === 0 ? (
                <div className="p-6 text-center text-sm text-neutral-500">
                  Nessun articolo visibile in magazzino.
                </div>
              ) : (
                <div className="space-y-2">
                  {listMagazzino.map((a) => {
                    const s = statoScorte(a);
                    const disp = disponibili(a);

                    return (
                      <div key={a.id} className={["rounded-2xl border border-neutral-200 bg-white p-3 hover:bg-neutral-50 transition", s.card].join(" ")}>
                        <button
                          onClick={() => setSelected(a)}
                          className="w-full text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">{a.descrizione}</div>
                              <div className="truncate text-xs text-neutral-500">{a.cod_articolo}</div>

                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${s.pill}`}>{s.label}</span>
                                <span className="text-xs text-neutral-500">min {fmtInt(a.scorta_minima ?? 0)}</span>
                                {a.in_arrivo > 0 && <span className="text-xs text-neutral-500">• in arrivo {fmtInt(a.in_arrivo)}</span>}
                              </div>

                              <div className="mt-2 text-xs text-neutral-500">
                                Magazzino: {fmtInt(a.scatole_inventario)} • Impegnate: {fmtInt(a.scatole_impegnate)}
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-3xl font-semibold leading-none">{fmtInt(disp)}</div>
                              <div className="mt-1 text-xs text-neutral-500">disponibili</div>
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
              {!selected ? (
                <div className="flex h-full min-h-[240px] items-center justify-center text-sm text-neutral-500">
                  Seleziona un articolo dalla lista
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-3xl border border-neutral-200 bg-gradient-to-b from-neutral-50 to-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{selected.descrizione}</div>
                        <div className="text-xs text-neutral-500">{selected.cod_articolo}</div>
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statoScorte(selected).pill}`}>
                        {statoScorte(selected).label}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                        <div className="text-xs text-neutral-500">Magazzino</div>
                        <div className="mt-1 text-2xl font-semibold">{fmtInt(selected.scatole_inventario)}</div>
                      </div>
                      <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                        <div className="text-xs text-neutral-500">Impegnate</div>
                        <div className="mt-1 text-2xl font-semibold">{fmtInt(selected.scatole_impegnate)}</div>
                      </div>
                      <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                        <div className="text-xs text-neutral-500">Disponibili</div>
                        <div className="mt-1 text-2xl font-semibold">{fmtInt(disponibili(selected))}</div>
                      </div>
                    </div>

                    {selected.in_arrivo > 0 && (
                      <div className="mt-3 text-xs text-neutral-500">
                        In arrivo: {fmtInt(selected.in_arrivo)} • Copertura: {fmtInt(copertura(selected))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-3xl border border-neutral-200 p-4 space-y-3">
                    <div className="grid gap-2 md:grid-cols-2">
                      <div>
                        <div className="text-sm font-semibold">Scorta minima</div>
                        <div className="mt-2 flex gap-2">
                          <input value={editMin} onChange={(e) => setEditMin(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric"
                            className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-neutral-400" />
                          <button onClick={() => updateSelected({ scorta_minima: parseInt(editMin || "0", 10) })}
                            className="brand-btn shrink-0 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99]">Salva</button>
                        </div>
                      </div>

                      <div>
                        <div className="text-sm font-semibold">Impegnate (promemoria)</div>
                        <div className="mt-2 flex gap-2">
                          <input value={editImp} onChange={(e) => setEditImp(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric"
                            className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-neutral-400" />
                          <button onClick={() => updateSelected({ scatole_impegnate: parseInt(editImp || "0", 10) })}
                            className="brand-btn shrink-0 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99]">Salva</button>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                      <div>
                        <div className="text-sm font-semibold">Scorta obiettivo (per ordini)</div>
                        <div className="mt-2 flex gap-2">
                          <input value={editObj} onChange={(e) => setEditObj(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric"
                            className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-neutral-400" />
                          <button onClick={() => updateSelected({ scorta_obiettivo: parseInt(editObj || "0", 10) })}
                            className="brand-btn shrink-0 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99]">Salva</button>
                        </div>
                      </div>

                      <div>
                        <div className="text-sm font-semibold">Costo (€/scatola)</div>
                        <div className="mt-2 flex gap-2">
                          <input value={editCosto} onChange={(e) => setEditCosto(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal"
                            className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-neutral-400" />
                          <button
                            onClick={() => updateSelected({ prezzo_costo: parseFloat((editCosto || "0").replace(",", ".")) })}
                            className="brand-btn shrink-0 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
                          >
                            Salva
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-3">
                      <div>
                        <div className="text-sm font-semibold">Visibile in Magazzino (mamma)</div>
                        <div className="text-xs text-neutral-500">Se disattivi, resta solo per la sezione Ordini</div>
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

                  <div className="rounded-3xl border border-neutral-200 p-4">
                    <label className="block text-xs text-neutral-500">Carico / Scarico magazzino</label>
                    <input value={delta} onChange={(e) => setDelta(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="es. 2"
                      className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-neutral-400" />

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button onClick={() => applyDelta("+")}
                        className="brand-btn rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99]">+ Carico</button>
                      <button onClick={() => applyDelta("-")}
                        className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 shadow-sm active:scale-[0.99]">− Scarico</button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {tab === "ordini" && (
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-base font-semibold">Ordine consigliato</div>
                <button
                  onClick={() => {
                    // riempi il carrello con i suggeriti
                    const next: Record<string, number> = {};
                    for (const x of suggeriti) next[x.a.id] = x.qta;
                    setCarrello(next);
                    showToast("Suggerimenti aggiunti al carrello");
                  }}
                  className="brand-btn rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
                >
                  Suggerisci ordine
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {suggeriti.length === 0 ? (
                  <div className="text-sm text-neutral-500">Nessun articolo da ordinare (in base agli obiettivi).</div>
                ) : (
                  suggeriti.map(({ a, qta }) => (
                    <div key={a.id} className="rounded-2xl border border-neutral-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{a.descrizione}</div>
                          <div className="text-xs text-neutral-500 truncate">{a.cod_articolo}</div>
                          <div className="mt-2 text-xs text-neutral-500">
                            Disp {fmtInt(disponibili(a))} • Arrivo {fmtInt(a.in_arrivo)} • Obiettivo {fmtInt(a.scorta_obiettivo)}
                          </div>
                          <div className="mt-1 text-xs text-neutral-500">Costo: {fmtEur(Number(a.prezzo_costo) || 0)} / scatola</div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-semibold">{fmtInt(qta)}</div>
                          <div className="text-xs text-neutral-500">consigliate</div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="text-sm text-neutral-700">
                          Nel carrello: <span className="font-semibold">{fmtInt(carrello[a.id] || 0)}</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setCart(a.id, (carrello[a.id] || 0) + 1)}
                            className="brand-btn rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow-sm"
                          >
                            +
                          </button>
                          <button
                            onClick={() => setCart(a.id, clamp0((carrello[a.id] || 0) - 1))}
                            className="rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm"
                          >
                            −
                          </button>
                          <button
                            onClick={() => setCart(a.id, qta)}
                            className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
                          >
                            Usa consigliato
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="text-base font-semibold">Carrello ordine</div>

              <div className="mt-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-neutral-700">Totale</div>
                  <div className="text-lg font-semibold">{fmtEur(totaleCarrello)}</div>
                </div>
                {totaleCarrello > 0 && totaleCarrello < MIN_ORDINE_EUR && (
                  <div className="mt-2 rounded-2xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
                    Sotto minimo ordine ({fmtEur(MIN_ORDINE_EUR)}).
                  </div>
                )}
              </div>

              <div className="mt-3">
                <label className="text-xs text-neutral-500">Note ordine (facoltative)</label>
                <textarea
                  value={ordineNote}
                  onChange={(e) => setOrdineNote(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-neutral-400"
                  rows={3}
                  placeholder="es. consegna entro venerdì…"
                />
              </div>

              <div className="mt-3 space-y-2">
                {Object.entries(carrello).filter(([, q]) => q > 0).length === 0 ? (
                  <div className="text-sm text-neutral-500">Carrello vuoto.</div>
                ) : (
                  Object.entries(carrello)
                    .filter(([, q]) => q > 0)
                    .map(([id, q]) => {
                      const a = articoli.find((x) => x.id === id);
                      if (!a) return null;
                      const line = (q || 0) * (Number(a.prezzo_costo) || 0);
                      return (
                        <div key={id} className="rounded-2xl border border-neutral-200 bg-white p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">{a.descrizione}</div>
                              <div className="text-xs text-neutral-500 truncate">{a.cod_articolo}</div>
                              <div className="mt-1 text-xs text-neutral-500">
                                {fmtInt(q)} × {fmtEur(Number(a.prezzo_costo) || 0)} = {fmtEur(line)}
                              </div>
                            </div>
                            <button
                              onClick={() => setCart(id, 0)}
                              className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50"
                            >
                              Rimuovi
                            </button>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>

              <button
                onClick={confermaOrdine}
                disabled={totaleCarrello <= 0}
                className="brand-btn mt-3 w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
              >
                Conferma ordine (aggiorna “in arrivo”)
              </button>

              <button
                onClick={() => {
                  // testo ordine da copiare
                  const lines: string[] = [];
                  lines.push("ORDINE DOMOBAGS");
                  lines.push("");
                  for (const [id, q] of Object.entries(carrello).filter(([,qq]) => qq>0)) {
                    const a = articoli.find((x) => x.id === id);
                    if (!a) continue;
                    lines.push(`${a.cod_articolo} - ${a.descrizione} : ${q} scatole`);
                  }
                  lines.push("");
                  lines.push(`Totale stimato: ${fmtEur(totaleCarrello)}`);
                  if (ordineNote.trim()) {
                    lines.push("");
                    lines.push(`Note: ${ordineNote.trim()}`);
                  }
                  navigator.clipboard.writeText(lines.join("\n"));
                  showToast("Testo ordine copiato");
                }}
                className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50"
              >
                Copia testo ordine
              </button>
            </section>
          </div>
        )}

        {tab === "arrivi" && (
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-semibold">Arrivi</div>
                  <div className="text-sm text-neutral-500">Seleziona le righe arrivate e premi “Ricevi selezionati”.</div>
                </div>
                <button
                  onClick={riceviSelezionati}
                  className="brand-btn rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
                >
                  Ricevi selezionati
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {righeAperte.length === 0 ? (
                  <div className="text-sm text-neutral-500">Nessun arrivo in attesa.</div>
                ) : (
                  righeAperte.map((r) => (
                    <div key={r.id} className="rounded-2xl border border-neutral-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={!!arriviSel[r.id]}
                            onChange={(e) => setArriviSel((p) => ({ ...p, [r.id]: e.target.checked }))}
                            className="mt-1 h-5 w-5"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{r.descrizione}</div>
                            <div className="text-xs text-neutral-500 truncate">{r.cod_articolo}</div>
                            <div className="mt-1 text-xs text-neutral-500">
                              Quantità: <span className="font-semibold">{fmtInt(r.qta)}</span> • costo: {fmtEur(Number(r.prezzo_costo) || 0)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right text-xs text-neutral-500">
                          Ordine: {r.ordine_id.slice(0, 8)}…
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
