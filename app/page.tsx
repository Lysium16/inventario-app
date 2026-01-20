"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  created_at: string;
  ordine_id: string;
  articolo_id: string;
  descrizione: string;
  cod_articolo: string;
  qta: number; // scatole ordinate
  prezzo_costo: number;
  arrived: boolean;
  arrived_at: string | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const MIN_ORDINE_EUR = 1000;

// Colore brand (verde acqua del logo) — se vuoi lo stesso identico HEX del logo, me lo dai e lo metto qui
const DOMOBAGS_GREEN = "#2FA4A9";
const BRAND_BG = "#E8F7F7";
const BRAND_TEXT = "#064B4D";

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
  if (disp <= min)
    return { k: "critico" as const, label: "Critico", pill: "bg-red-100 text-red-700 border-red-200", card: "card-critico" };
  if (disp <= min + 3)
    return { k: "basso" as const, label: "Basso", pill: "bg-orange-100 text-orange-800 border-orange-200", card: "card-basso" };
  return { k: "ok" as const, label: "OK", pill: "border", card: "" };
}
function prio(a: Articolo) {
  const k = statoScorte(a).k;
  return k === "critico" ? 0 : k === "basso" ? 1 : 2;
}

function parseMisura(full: string) {
  const s = (full || "").trim();
  const m = s.match(/\b\d{1,3}(?:\+\d{1,3})?\s*[xX]\s*\d{1,3}\b/);
  if (!m) return { misura: "", descrizione: s };
  const misura = m[0].replace(/\s+/g, "");
  const descrizione = s.replace(m[0], "").replace(/\s{2,}/g, " ").trim();
  return { misura, descrizione: descrizione || s };
}

// PDF: solo MISURA / DESCRIZIONE / PEZZI
function exportOrdinePdf(articoli: Articolo[], carrello: Record<string, number>) {
  const rows: Array<[string, string, string]> = [];

  for (const [id, scatole] of Object.entries(carrello || {})) {
    const a = articoli.find((x) => x.id === id);
    if (!a) continue;

    const { misura, descrizione } = parseMisura(a.descrizione || "");
    const pezzi = (scatole || 0) * (a.pz_per_scatola || 0);

    if (scatole > 0 && pezzi > 0) {
      rows.push([misura, descrizione, String(pezzi)]);
    }
  }

  rows.sort((r1, r2) => (r1[0] || "").localeCompare(r2[0] || "", "it", { sensitivity: "base" }));

  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Elenco ordine borse in carta", 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const d = new Date();
  const dataIt = d.toLocaleDateString("it-IT");
  doc.text(`Data: ${dataIt}`, 14, 25);

  autoTable(doc, {
    startY: 32,
    head: [["Misura", "Descrizione", "Pezzi"]],
    body: rows,
    styles: { font: "helvetica", fontSize: 10, cellPadding: 2 },
    headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 120 },
      2: { cellWidth: 25, halign: "right" },
    },
  });

  doc.save(`elenco-ordine-borse-in-carta_${dataIt.replaceAll("/", "-")}.pdf`);
}

type Tab = "magazzino" | "ordini" | "arrivi" | "dashboard";

export default function Page() {
  const [tab, setTab] = useState<Tab>("magazzino");
  const [simpleView, setSimpleView] = useState(false);const pin = window.prompt("Modalità Nikolas: inserisci PIN");
    // PIN semplice: cambialo qui se vuoi
    if (pin === "diabolica") {
      localStorage.setItem("nikolas_dashboard", "1");
      setIsAdmin(true);
      showToast("Dashboard attiva");
      setTab("dashboard");
    } else if (pin !== null) {
      alert("PIN errato.");
    }
  }const [loading, setLoading] = useState(true);
  const [articoli, setArticoli] = useState<Articolo[]>([]);
  const [query, setQuery] = useState("");

  const [selected, setSelected] = useState<Articolo | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const [flash, setFlash] = useState<null | "green" | "red">(null);

  // Magazzino: carico/scarico
  const [delta, setDelta] = useState("");

  // Impegnate: delta che si svuota
  const [impDelta, setImpDelta] = useState("");

  // Impostazioni “protette”
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editMin, setEditMin] = useState("");
  const [editObj, setEditObj] = useState("");
  const [editCosto, setEditCosto] = useState("");
  const [editVis, setEditVis] = useState(true);

  // Ordini (Blocco 2)
  const [carrello, setCarrello] = useState<Record<string, number>>({});
  const [ordineNote, setOrdineNote] = useState("");

  // Arrivi (preparazione per Blocco 3)
  const [righeAperte, setRigheAperte] = useState<RigaOrdine[]>([]);
  const [arriviSel, setArriviSel] = useState<Record<string, boolean>>({});function showToast(msg: string) {
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

  async function loadRigheAperte() {
    const { data, error } = await supabase
      .from("righe_ordine")
      .select("*")
      .eq("arrived", false)
      .order("created_at", { ascending: false });

    if (error) return alert(error.message);
    setRigheAperte((data || []) as RigaOrdine[]);
  }

  useEffect(() => {
    (async () => {
      await loadArticoli();
      await loadRigheAperte();
    })();
  }, []);

  useEffect(() => {
    if (!selected) return;
    const fresh = articoli.find((a) => a.id === selected.id);
    if (!fresh) return;

    setSelected(fresh);
    setEditMin(String(fresh.scorta_minima ?? 0));
    setEditObj(String(fresh.scorta_obiettivo ?? 0));
    setEditCosto(String(fresh.prezzo_costo ?? 0));
    setEditVis(!!fresh.visibile_magazzino);

    setDelta("");
    setImpDelta("");
    if (!simpleView) { setShowAdvanced(false) };
  }, [articoli]); // eslint-disable-line react-hooks/exhaustive-deps

  const listMagazzino = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articoli
      .filter((a) => a.visibile_magazzino !== false)
      .filter((a) => !q || a.cod_articolo.toLowerCase().includes(q) || a.descrizione.toLowerCase().includes(q))
      .sort((a, b) => {
        const pa = prio(a),
          pb = prio(b);
        if (pa !== pb) return pa - pb;
        return a.descrizione.localeCompare(b.descrizione, "it", { sensitivity: "base" });
      });
  }, [articoli, query]);

  const criticiCount = useMemo(
    () => listMagazzino.filter((a) => statoScorte(a).k === "critico").length,
    [listMagazzino]
  );

  const suggeriti = useMemo(() => {
    return articoli
      .map((a) => ({ a, qta: daOrdinareConsigliato(a) }))
      .filter((x) => x.qta > 0)
      .sort((x, y) => prio(x.a) - prio(y.a));
  }, [articoli]);

  function carrelloQty(id: string) {
    return carrello[id] || 0;
  }

  function setCarrelloQty(id: string, qta: number) {
    setCarrello((prev) => {
      const next = { ...prev };
      if (qta <= 0) delete next[id];
      else next[id] = qta;
      return next;
    });
  }

  const totaleCarrello = useMemo(() => {
    let tot = 0;
    for (const [id, qta] of Object.entries(carrello)) {
      const a = articoli.find((x) => x.id === id);
      if (!a) continue;
      const costo = Number(a.prezzo_costo || 0);
      tot += (qta || 0) * costo;
    }
    return Math.round(tot * 100) / 100;
  }, [carrello, articoli]);

  const righeCarrello = useMemo(() => {
    return Object.entries(carrello)
      .map(([id, qta]) => {
        const a = articoli.find((x) => x.id === id);
        return a ? { a, qta } : null;
      })
      .filter(Boolean) as Array<{ a: Articolo; qta: number }>;
  }, [carrello, articoli]);

  // ===== Dashboard (solo Nikolas) =====
  const dash = useMemo(() => {
    const visibili = articoli.filter(a => a.visibile_magazzino !== false);
    const totArticoli = visibili.length;

    const critici = visibili.filter(a => statoScorte(a).k === "critico");
    const bassi = visibili.filter(a => statoScorte(a).k === "basso");

    let valoreMagazzino = 0;        // scatole fisiche * costo
    let valoreDisponibili = 0;      // disponibili * costo
    let valoreCopertura = 0;        // (disponibili + in_arrivo) * costo

    for (const a of visibili) {
      const costo = Number(a.prezzo_costo || 0);
      valoreMagazzino += (a.scatole_inventario || 0) * costo;
      valoreDisponibili += disponibili(a) * costo;
      valoreCopertura += copertura(a) * costo;
    }

    // Top deficit (quanto manca per arrivare a obiettivo considerando anche in arrivo)
    const topDeficit = visibili
      .map(a => ({
        a,
        deficit: daOrdinareConsigliato(a),
        stato: statoScorte(a).label,
        disp: disponibili(a),
        inArrivo: a.in_arrivo || 0,
        obj: a.scorta_obiettivo || 0,
      }))
      .filter(x => x.deficit > 0)
      .sort((x, y) => {
        const px = prio(x.a), py = prio(y.a);
        if (px !== py) return px - py;
        return y.deficit - x.deficit;
      })
      .slice(0, 10);

    // Spesa stimata ordine consigliato (se lo facessi adesso)
    let spesaConsigliata = 0;
    for (const x of topDeficit) {
      const costo = Number(x.a.prezzo_costo || 0);
      spesaConsigliata += (x.deficit || 0) * costo;
    }

    return {
      totArticoli,
      nCritici: critici.length,
      nBassi: bassi.length,
      valoreMagazzino,
      valoreDisponibili,
      valoreCopertura,
      spesaConsigliata,
      topDeficit,
    };
  }, [articoli]);async function updateSelected(patch: Partial<Articolo>) {
    if (!selected) return;
    const { error } = await supabase.from("articoli").update(patch).eq("id", selected.id);
    if (error) return alert(error.message);
    showToast("Aggiornato");
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

  async function applyImpegnateDelta(sign: "+" | "-") {
    if (!selected) return;

    const n = parseInt(impDelta, 10);
    if (!Number.isFinite(n) || n <= 0) return alert("Inserisci una quantità valida.");

    const current = selected.scatole_impegnate || 0;
    const next = sign === "+" ? current + n : current - n;
    if (next < 0) return alert("Non puoi andare sotto zero.");

    const { error } = await supabase.from("articoli").update({ scatole_impegnate: next }).eq("id", selected.id);
    if (error) return alert(error.message);

    setImpDelta(""); // ✅ svuota campo
    showToast("Impegnate aggiornate");
    await loadArticoli();
  }

  function suggerisciOrdine() {
    const next: Record<string, number> = {};
    for (const { a, qta } of suggeriti) next[a.id] = qta;
    setCarrello(next);
    showToast("Ordine consigliato pronto");
    setTab("ordini");
  }

  async function confermaOrdine() {
    if (righeCarrello.length === 0) return alert("Carrello vuoto.");

    // Totale ordine (per soglia 1000€)
    const totale = totaleCarrello;

    // Crea ordine
    const { data: ordineIns, error: e1 } = await supabase
      .from("ordini")
      .insert({ note: ordineNote || "", totale, stato: "APERTO" })
      .select("id")
      .single();

    if (e1) return alert(e1.message);
    const ordineId = (ordineIns as any).id as string;

    // Inserisci righe ordine
    const rows = righeCarrello.map(({ a, qta }) => ({
      ordine_id: ordineId,
      articolo_id: a.id,
      descrizione: a.descrizione || "",
      cod_articolo: a.cod_articolo || "",
      qta,
      prezzo_costo: Number(a.prezzo_costo || 0),
      arrived: false,
      arrived_at: null,
    }));

    const { error: e2 } = await supabase.from("righe_ordine").insert(rows);
    if (e2) return alert(e2.message);

    // Aggiorna in_arrivo sugli articoli
    for (const { a, qta } of righeCarrello) {
      const nextInArrivo = (a.in_arrivo || 0) + qta;
      const { error } = await supabase.from("articoli").update({ in_arrivo: nextInArrivo }).eq("id", a.id);
      if (error) return alert(error.message);
    }

    // Pulizia
    setCarrello({});
    setOrdineNote("");
    showToast("Ordine confermato: messo in ARRIVO");
    await loadArticoli();
    await loadRigheAperte();
    setTab("arrivi");
  }

  function toggleArrivo(id: string) {
    setArriviSel((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function caricaArriviSelezionati() {
    const ids = Object.entries(arriviSel).filter(([, v]) => v).map(([id]) => id);
    if (ids.length === 0) return alert("Seleziona almeno una riga arrivata.");

    // Prendo righe selezionate
    const rows = righeAperte.filter((r) => ids.includes(r.id));
    if (rows.length === 0) return alert("Selezione non valida.");

    // 1) per ogni riga: aggiorna articolo (inventario +, in_arrivo -) e marca arrived
    for (const r of rows) {
      const a = articoli.find((x) => x.id === r.articolo_id);
      if (!a) continue;

      const nextInv = (a.scatole_inventario || 0) + (r.qta || 0);
      const nextInArrivo = (a.in_arrivo || 0) - (r.qta || 0);

      if (nextInArrivo < 0) {
        // Non blocco tutto: correggo a 0 (meglio che rompere)
        console.warn("in_arrivo sotto zero, correggo a 0", a.id);
      }

      const { error: eA } = await supabase
        .from("articoli")
        .update({ scatole_inventario: nextInv, in_arrivo: Math.max(0, nextInArrivo) })
        .eq("id", a.id);

      if (eA) return alert(eA.message);

      const { error: eR } = await supabase
        .from("righe_ordine")
        .update({ arrived: true, arrived_at: new Date().toISOString() })
        .eq("id", r.id);

      if (eR) return alert(eR.message);
    }

    // 2) per ogni ordine coinvolto: se non ci sono più righe aperte -> stato RICEVUTO
    const ordineIds = Array.from(new Set(rows.map((r) => r.ordine_id)));
    for (const oid of ordineIds) {
      const { data: stillOpen, error: eCheck } = await supabase
        .from("righe_ordine")
        .select("id")
        .eq("ordine_id", oid)
        .eq("arrived", false);

      if (eCheck) return alert(eCheck.message);

      if (!stillOpen || stillOpen.length === 0) {
        const { error: eUp } = await supabase.from("ordini").update({ stato: "RICEVUTO" }).eq("id", oid);
        if (eUp) return alert(eUp.message);
      }
    }

    // pulizia + refresh
    setArriviSel({});
    showToast("Caricato in magazzino");
    await loadArticoli();
    await loadRigheAperte();
  }

function TopTabs() {
    return (
      <div className="flex items-center gap-2">
        {[
          ["magazzino", "Magazzino"],
          ["ordini", "Ordini"],
          ["arrivi", "Arrivi"],
          ["dashboard", "Dashboard"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k as Tab)}
            className={`rounded-2xl px-3 py-2 text-sm font-semibold transition ${
              tab === k ? "text-white" : "text-neutral-700 hover:bg-neutral-100"
            }`}
            style={tab === k ? { backgroundColor: DOMOBAGS_GREEN } : undefined}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/85 backdrop-blur-xl">
  <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
    <div className="flex items-center gap-3">
      <div className="h-10 w-32 overflow-hidden rounded-xl bg-white">
        <img src="/domobags-logo.png" alt="Domobags" className="h-full w-full object-contain" />
      </div>
      <div>
        <div className="text-lg font-semibold tracking-tight text-neutral-900">
          Magazzino Domobags
        </div>
        <div className="text-xs text-neutral-500">
          {tab === "magazzino" && `${criticiCount} articoli critici`}
          {tab === "ordini" && `Totale ordine: ${fmtEur(totaleCarrello)}`}
          {tab === "arrivi" && `Arrivi in attesa: ${righeAperte.length}`}
        </div>
      </div>
    </div>

    <TopTabs />
  </div>

  {tab === "magazzino" && (
    <div className="mx-auto max-w-6xl px-4 pb-3">
      <div
        className="rounded-2xl border px-4 py-3 text-sm"
        style={{
          borderColor: DOMOBAGS_GREEN,
          backgroundColor: "#E8F7F7",
          color: "#064B4D",
        }}
      >
        <strong>Approvata da mamma Domobags™</strong><br />
        Se qualcosa non funziona, è sicuramente colpa del computer.
      </div>
    </div>
  )}
<div className="mx-auto max-w-6xl px-4 pb-3">
  <div className="rounded-2xl border px-4 py-3 text-sm"
    style={{ borderColor: DOMOBAGS_GREEN, backgroundColor: "#E8F7F7", color: "#064B4D" }}>
    <strong>Modalità Mamma</strong><br/>
    tocca solo i pulsanti grandi.<br/>
    Se sparisce qualcosa, non è un bug: è la tecnologia che si difende.
  </div>

  <div className="mt-2 flex items-center justify-between gap-3">
    <div className="text-xs text-neutral-500">
      Vista semplice: nasconde le cose “da Nikolas”, lascia solo quello che serve.
    </div>

    <button
      onClick={() => setSimpleView(v => !v)}
      className="rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow-sm"
      style={{ backgroundColor: DOMOBAGS_GREEN }}
    >
      {simpleView ? "Vista completa" : "Vista semplice"}
    </button>
  </div>
</div>
</header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* TOAST */}
        {toast && (
          <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm shadow-sm">
            {toast}
          </div>
        )}

        {/* FLASH */}
        {flash && (
          <div
            className={`pointer-events-none fixed inset-0 z-40 ${flash === "green" ? "bg-emerald-400/10" : "bg-red-400/10"}`}
          />
        )}

        {/* MAGAZZINO */}
        {tab === "magazzino" && (
          <>
            <div className="mb-4">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cerca…"
                className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-neutral-400"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* LISTA */}
              <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-base font-semibold">Articoli</h2>
                  <span className="text-xs text-neutral-500">{loading ? "…" : `${listMagazzino.length} tot`}</span>
                </div>

                {loading ? (
                  <p className="text-sm text-neutral-500">Caricamento…</p>
                ) : listMagazzino.length === 0 ? (
                  <p className="text-sm text-neutral-500">Nessun articolo.</p>
                ) : (
                  <div className="space-y-2">
                    {listMagazzino.map((a) => {
                      const st = statoScorte(a);
                      const disp = disponibili(a);
                      return (
                        <button
                          key={a.id}
                          onClick={() => setSelected(a)}
                          className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                            selected?.id === a.id ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 bg-white hover:bg-neutral-50"
                          } ${st.card}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold">{a.descrizione}</div>
                              <div className="text-xs text-neutral-500">{a.cod_articolo}</div>
                            </div>

                            <div className="text-right">
                              <div className="text-lg font-semibold">{disp}</div>
                              <div className="text-xs text-neutral-500">disponibili</div>
                            </div>
                          </div>

                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs ${st.pill}`}>
                              {st.label}
                            </span>
                            <span className="text-xs text-neutral-500">
                              Magazzino {a.scatole_inventario || 0} • Impegnate {a.scatole_impegnate || 0} • In arrivo {a.in_arrivo || 0}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <button
                  onClick={suggerisciOrdine}
                  className="mt-3 w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
                  style={{ backgroundColor: DOMOBAGS_GREEN }}
                >
                  Suggerisci ordine
                </button>
              </section>

              {/* DETTAGLIO */}
              <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-base font-semibold">Dettaglio</h2>

                {!selected ? (
                  <p className="text-sm text-neutral-500">Seleziona un articolo dalla lista.</p>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                      <div className="text-sm font-semibold">{selected.descrizione}</div>
                      <div className="text-xs text-neutral-500">{selected.cod_articolo}</div>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-2xl bg-white p-3">
                          <div className="text-xs text-neutral-500">Magazzino</div>
                          <div className="text-xl font-semibold">{selected.scatole_inventario || 0}</div>
                        </div>
                        <div className="rounded-2xl bg-white p-3">
                          <div className="text-xs text-neutral-500">Impegnate</div>
                          <div className="text-xl font-semibold">{selected.scatole_impegnate || 0}</div>
                        </div>
                        <div className="rounded-2xl bg-white p-3">
                          <div className="text-xs text-neutral-500">Disponibili</div>
                          <div className="text-xl font-semibold">{disponibili(selected)}</div>
                        </div>
                      </div>

                      <div className="mt-2 text-xs text-neutral-500">
                        In arrivo: {selected.in_arrivo || 0} • Copertura: {copertura(selected)}
                      </div>
                    </div>

                    {/* Carico / Scarico */}
                    <div className="rounded-2xl border border-neutral-200 p-3">
                      <label className="block text-xs text-neutral-500">Scatole da aggiungere/togliere</label>
                      <input
                        value={delta}
                        onChange={(e) => setDelta(e.target.value.replace(/[^\d]/g, ""))}
                        inputMode="numeric"
                        placeholder="es. 2"
                        className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-neutral-400"
                      />

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => applyDelta("+")}
                          className="rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
                          style={{ backgroundColor: DOMOBAGS_GREEN }}
                        >
                          + Carico
                        </button>
                        <button
                          onClick={() => applyDelta("-")}
                          className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 shadow-sm active:scale-[0.99]"
                        >
                          − Scarico
                        </button>
                      </div>
                    </div>

                    {/* Impegnate delta */}
                    <div className="rounded-2xl border border-neutral-200 p-3">
                      <div className="text-sm font-semibold">Impegnate (promemoria)</div>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <input
                          value={impDelta}
                          onChange={(e) => setImpDelta(e.target.value.replace(/[^\d]/g, ""))}
                          inputMode="numeric"
                          placeholder="es. 5"
                          className="col-span-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-neutral-400"
                        />
                        <button
                          onClick={() => applyImpegnateDelta("+")}
                          className="rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
                          style={{ backgroundColor: DOMOBAGS_GREEN }}
                        >
                          + Applica
                        </button>
                        <button
                          onClick={() => applyImpegnateDelta("-")}
                          className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 shadow-sm active:scale-[0.99]"
                        >
                          − Applica
                        </button>
                        <div className="flex items-center justify-end text-xs text-neutral-500">(si svuota dopo)</div>
                      </div>
                    </div>

                    {/* Impostazioni */}
                    <div className="rounded-3xl border border-neutral-200 p-4 space-y-3">
                      <button
                        onClick={() => { if (!simpleView) { setShowAdvanced(!showAdvanced); } }}
                        className="flex w-full items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 shadow-sm hover:bg-neutral-50"
                      >
                        <span>Impostazioni</span>
                        <span className="text-neutral-500">{showAdvanced ? "▲" : "▼"}</span>
                      </button>

                      {showAdvanced && (
                        <div className="space-y-3">
                          <div className="grid gap-2 md:grid-cols-2">
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
                                  onClick={() => updateSelected({ scorta_minima: parseInt(editMin || "0", 10) })}
                                  className="shrink-0 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
                                  style={{ backgroundColor: DOMOBAGS_GREEN }}
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
                                  onClick={() => updateSelected({ scorta_obiettivo: parseInt(editObj || "0", 10) })}
                                  className="shrink-0 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
                                  style={{ backgroundColor: DOMOBAGS_GREEN }}
                                >
                                  Applica
                                </button>
                              </div>
                            </div>
                          </div>

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
                                  onClick={() => updateSelected({ prezzo_costo: parseFloat((editCosto || "0").replace(",", ".")) })}
                                  className="shrink-0 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
                                  style={{ backgroundColor: DOMOBAGS_GREEN }}
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

            </div>
          </>
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
                  style={{ backgroundColor: DOMOBAGS_GREEN }}
                >
                  Ricalcola
                </button>
              </div>

              {suggeriti.length === 0 ? (
                <p className="text-sm text-neutral-500">Niente da ordinare (in base agli obiettivi).</p>
              ) : (
                <div className="space-y-2">
                  {suggeriti.map(({ a, qta }) => (
                    <div key={a.id} className="rounded-2xl border border-neutral-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">{a.descrizione}</div>
                          <div className="text-xs text-neutral-500">{a.cod_articolo}</div>
                          <div className="mt-1 text-xs text-neutral-500">
                            Disponibili {disponibili(a)} • In arrivo {a.in_arrivo || 0} • Obiettivo {a.scorta_obiettivo || 0}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-lg font-semibold">{qta}</div>
                          <div className="text-xs text-neutral-500">scatole</div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="text-xs text-neutral-500">Costo stimato: {fmtEur(qta * Number(a.prezzo_costo || 0))}</div>
                        <button
                          onClick={() => setCarrelloQty(a.id, qta)}
                          className="rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow-sm"
                          style={{ backgroundColor: DOMOBAGS_GREEN }}
                        >
                          Aggiungi all’ordine
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
</section>

            <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">Carrello ordine</h2>
                <button
                  onClick={() => exportOrdinePdf(articoli, carrello)}
                  className="rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow-sm"
                  style={{ backgroundColor: DOMOBAGS_GREEN }}
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
                          <div className="mt-1 text-xs text-neutral-500">{fmtEur(Number(a.prezzo_costo || 0))} / scatola</div>
                        </div>

                        <div className="text-right">
                          <div className="text-sm font-semibold">{fmtEur(qta * Number(a.prezzo_costo || 0))}</div>
                          <div className="text-xs text-neutral-500">tot riga</div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCarrelloQty(a.id, qta - 1)}
                            className="h-10 w-10 rounded-2xl border border-neutral-300 bg-white text-lg font-semibold"
                          >
                            −
                          </button>
                          <div className="min-w-12 text-center text-base font-semibold">{qta}</div>
                          <button
                            onClick={() => setCarrelloQty(a.id, qta + 1)}
                            className="h-10 w-10 rounded-2xl text-lg font-semibold text-white"
                            style={{ backgroundColor: DOMOBAGS_GREEN }}
                          >
                            +
                          </button>
                        </div>

                        <button
                          onClick={() => setCarrelloQty(a.id, 0)}
                          className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
                        >
                          Rimuovi
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Totale</div>
                  <div className="text-lg font-semibold">{fmtEur(totaleCarrello)}</div>
                </div>

                {totaleCarrello > 0 && totaleCarrello < MIN_ORDINE_EUR && (
                  <div className="mt-2 rounded-2xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
                    Sotto minimo d’ordine ({fmtEur(MIN_ORDINE_EUR)}).
                  </div>
                )}

                <textarea
                  value={ordineNote}
                  onChange={(e) => setOrdineNote(e.target.value)}
                  placeholder="Note ordine (facoltative)…"
                  className="mt-3 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-neutral-400"
                  rows={3}
                />

                <button
                  onClick={confermaOrdine}
                  className="mt-3 w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
                  style={{ backgroundColor: DOMOBAGS_GREEN }}
                >
                  Conferma ordine (metti in arrivo)
                </button>
              </div>
            </section>
          </div>
        )}

        {/* ARRIVI */}
{tab === "arrivi" && (
  <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-base font-semibold">In arrivo</h2>
      <div className="flex items-center gap-2">
        <button
          onClick={loadRigheAperte}
          className="rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow-sm"
          style={{ backgroundColor: DOMOBAGS_GREEN }}
        >
          Aggiorna
        </button>
        <button
          onClick={caricaArriviSelezionati}
          className="rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow-sm"
          style={{ backgroundColor: DOMOBAGS_GREEN }}
        >
          Carica selezionati
        </button>
      </div>
    </div>

    {righeAperte.length === 0 ? (
      <p className="text-sm text-neutral-500">Niente in arrivo.</p>
    ) : (
      <div className="space-y-2">
        {righeAperte.map((r) => (
          <button
            key={r.id}
            onClick={() => toggleArrivo(r.id)}
            className={`w-full rounded-2xl border p-3 text-left transition ${
              arriviSel[r.id] ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 bg-white hover:bg-neutral-50"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  <div
                    className={`h-6 w-6 rounded-lg border flex items-center justify-center ${
                      arriviSel[r.id] ? "text-white" : "text-transparent"
                    }`}
                    style={{
                      borderColor: arriviSel[r.id] ? DOMOBAGS_GREEN : "rgb(212 212 212)",
                      backgroundColor: arriviSel[r.id] ? DOMOBAGS_GREEN : "white",
                    }}
                  >
                    ✓
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold">{r.descrizione}</div>
                  <div className="text-xs text-neutral-500">{r.cod_articolo}</div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-lg font-semibold">{r.qta}</div>
                <div className="text-xs text-neutral-500">scatole</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    )}

    <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
      Seleziona le righe arrivate e premi <strong>Carica selezionati</strong>.
    </div>
  </section>
)}

{/* DASHBOARD (solo Nikolas) */}
{tab === "dashboard" && (
  <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
    
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Dashboard (solo Nikolas)</h2>
          <div className="text-xs text-neutral-500">Zero fronzoli, solo numeri.</div>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <div className="rounded-2xl border border-neutral-200 bg-white p-3">
            <div className="text-xs text-neutral-500">Articoli visibili</div>
            <div className="text-2xl font-semibold">{dash.totArticoli}</div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-3">
            <div className="text-xs text-neutral-500">Critici</div>
            <div className="text-2xl font-semibold">{dash.nCritici}</div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-3">
            <div className="text-xs text-neutral-500">Bassi</div>
            <div className="text-2xl font-semibold">{dash.nBassi}</div>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <div className="rounded-2xl border border-neutral-200 bg-white p-3">
            <div className="text-xs text-neutral-500">Valore magazzino (fisico)</div>
            <div className="text-xl font-semibold">{fmtEur(dash.valoreMagazzino)}</div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-3">
            <div className="text-xs text-neutral-500">Valore disponibili</div>
            <div className="text-xl font-semibold">{fmtEur(dash.valoreDisponibili)}</div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-3">
            <div className="text-xs text-neutral-500">Valore copertura (disp + arrivo)</div>
            <div className="text-xl font-semibold">{fmtEur(dash.valoreCopertura)}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Spesa stimata per “ordine consigliato”</div>
            <div className="text-lg font-semibold">{fmtEur(dash.spesaConsigliata)}</div>
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            (Calcolata come “quanto manca all’obiettivo” × costo/scatola, considerando anche l’in arrivo)
          </div>
        </div>

        <div className="rounded-3xl border border-neutral-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">Top 10: cosa manca per arrivare all’obiettivo</div>
            <button
              onClick={suggerisciOrdine}
              className="rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow-sm"
              style={{ backgroundColor: DOMOBAGS_GREEN }}
            >
              Porta in Ordini
            </button>
          </div>

          {dash.topDeficit.length === 0 ? (
            <div className="text-sm text-neutral-500">Niente da ordinare (in base agli obiettivi).</div>
          ) : (
            <div className="space-y-2">
              {dash.topDeficit.map((x) => (
                <div key={x.a.id} className="rounded-2xl border border-neutral-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{x.a.descrizione}</div>
                      <div className="text-xs text-neutral-500">{x.a.cod_articolo}</div>
                      <div className="mt-1 text-xs text-neutral-500">
                        Stato: {x.stato} • Disponibili {x.disp} • In arrivo {x.inArrivo} • Obiettivo {x.obj}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold">{x.deficit}</div>
                      <div className="text-xs text-neutral-500">scatole da ordinare</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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










