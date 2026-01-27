"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Tab = "magazzino" | "ordini" | "arrivi" | "dashboard" | "completate";

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
    return `Ã¢â€š¬ ${(v || 0).toFixed(2)}`;
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

function statoScorta(a: any): "ok" | "basso" | "critico" {
  // Stato basato su DISPONIBILI (inventario - impegnate)
  const inv = clampInt(safeNum(a?.scatole_inventario ?? 0));
  const imp = clampInt(safeNum(a?.scatole_impegnate ?? 0));
  const q = Math.max(0, inv - imp);

  const min = clampInt(safeNum(a?.scorta_minima ?? 0));
  if (min <= 0) return "ok";

  // soglia verde = min + metÃƒ (min) (arrotondata su)
  const half = Math.ceil(min / 2);
  const green = min + half;

  if (q <= min) return "critico";
  if (q < green) return "basso";
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



async function confermaOrdine2(
  articoli: Articolo[],
  carrello: Record<string, number>,
  loadArticoli: () => Promise<void>,
  setCarrello: (v: any) => void,
  confirmBusy: boolean,
  setConfirmBusy: (v: boolean) => void
) {
  if (confirmBusy) return;
  try {
    setConfirmBusy(true);

    // 1) PDF
    exportOrdinePdf(articoli, carrello);

    // 2) Sposta in ARRIVI (in_arrivo += qta_ordinate) - carrello Ãƒ¨ in scatole
    const ids = Object.keys(carrello || {});
    for (const id of ids) {
      const qta = clampInt(Number((carrello as any)[id]));
      if (qta <= 0) continue;

      const a = articoli.find((x) => x.id === id);
      if (!a) continue;

      const cur = clampInt(safeNum(a.in_arrivo ?? 0));
      const next = cur + qta;

      const { error } = await supabase
        .from("articoli")
        .update({ in_arrivo: next })
        .eq("id", id);

      if (error) throw error;
    }

    await loadArticoli();
    setCarrello({});
  } catch (e: any) {
    console.error(e);
    alert("Errore durante la conferma ordine: " + (e?.message ?? String(e)));
  } finally {
    setConfirmBusy(false);
  }
}

async function confermaOrdine(
  articoli: Articolo[],
  carrello: Record<string, number>,
  loadArticoli: () => Promise<void>,
  setCarrello: (v: any) => void
) {
  // 1) PDF
  exportOrdinePdf(articoli, carrello);

  // 2) Sposta in ARRIVI (in_arrivo += qta_ordinate) - carrello Ãƒ¨ in scatole
  const ids = Object.keys(carrello || {});
  for (const id of ids) {
    const qta = clampInt(Number((carrello as any)[id]));
    if (qta <= 0) continue;

    const a = articoli.find((x) => x.id === id);
    if (!a) continue;

    const cur = clampInt(safeNum(a.in_arrivo ?? 0));
    const next = cur + qta;

    const { error } = await supabase
      .from("articoli")
      .update({ in_arrivo: next })
      .eq("id", id);

    if (error) throw error;
  }

  // 3) refresh e svuota carrello
  await loadArticoli();
  setCarrello({});
}


export default function Home() {
  const [openNewArt, setOpenNewArt] = useState(false);
  const [newCod, setNewCod] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newMin, setNewMin] = useState<number>(0);
const [tab, setTab] = useState<Tab>("magazzino");
  const [loading, setLoading] = useState(true);
  const [articoli, setArticoli] = useState<Articolo[]>([]);
  const [query, setQuery] = useState("");
  // QUICK_ADD_ARTICOLO
  const [qaCod, setQaCod] = useState("");

  const [qaDescr, setQaDescr] = useState("");
  const [qaDesc, setQaDesc] = useState("");
  const [qaMin, setQaMin] = useState(0);
  const [qaInv, setQaInv] = useState(0);
  const [qaImp, setQaImp] = useState(0);
  const [qaArr, setQaArr] = useState(0);
  const [qaPz, setQaPz] = useState<number>(1);
  const [qaBusy, setQaBusy] = useState(false);

  const quickAddArticolo = async () => {
    if (qaBusy) return;
    const cod = qaCod.trim();
    const desc = qaDesc.trim();
    if (!cod || !desc) {
      alert("Inserisci almeno MISURA/CODICE e DESCRIZIONE.");
      return;
    }
    setQaBusy(true);
    try {
      if (typeof (supabase as any)?.from !== "function") {
        throw new Error("supabase non disponibile in scope: impossibile inserire articolo (fallback).");
      }
      const { error } = await (supabase as any)
        .from("articoli")
        .insert([{
          cod_articolo: qaCod.trim(),
          descrizione: qaDesc.trim(),
          scatole_inventario: qaInv,
          scatole_impegnate: qaImp,
          in_arrivo: qaArr,
        pz_per_scatola: clampInt(safeNum(qaPz ?? 1)) || 1,
          scorta_minima: qaMin,
        }]);
      if (error) throw error;
      // dopo insert: ricarico in modo robusto (se esiste loadArticoli/fetchArticoli lo usa, altrimenti refresh)
      if (typeof (loadArticoli as any) === "function") {
        await (loadArticoli as any)();
      } else {
        // fallback universale
        window.location.reload();
      }

      setQaCod("");
      setQaDesc("");
      setQaMin(0); setQaInv(0); setQaImp(0); setQaArr(0);
    } catch (e: any) {
      console.error(e);
      alert("Errore inserimento articolo: " + (e?.message ?? String(e)));
    } finally {
      setQaBusy(false);
    }
  };

  // semplice / avanzato
  const [simpleView, setSimpleView] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(true);

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
  const [selectedCompletate, setSelectedCompletate] = useState<Record<string, number>>({});
  const [completeBusy, setCompleteBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [suggeriti, setSuggeriti] = useState<Array<{ a: Articolo; qta: number }>>([]);


  const articoliImpegnati = useMemo(() => {
    return (articoli || []).filter(
      a => clampInt(safeNum(a.scatole_impegnate ?? 0)) > 0
    );
  }, [articoli]);
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
    return "Solo per te: numeri e prioritÃƒ ";
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
    if (!Number.isFinite(n) || n <= 0) return alert("Inserisci una quantitÃƒ  valida.");

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
    if (!Number.isFinite(n) || n <= 0) return alert("Inserisci una quantitÃƒ  valida.");

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

      // quante scatole servono per tornare all'obiettivo considerando giÃƒ  in arrivo
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

  // ===== Dashboard calcoli =====
  const dash = useMemo(() => {
    const vis = articoli.filter((a) => a.visibile_magazzino !== false);
    const valoreMagazzino = vis.reduce((acc, a) => acc + clampInt(safeNum(a.scatole_inventario)) * safeNum(a.prezzo_costo ?? 0), 0);
    const valoreDisponibili = vis.reduce((acc, a) => acc + disponibili(a) * safeNum(a.prezzo_costo ?? 0), 0);

    const critici = vis
      .filter((a) => statoScorta(a) === "critico")
      .slice(0, 12);

    const topDeficit = vis
      .map((a) => {
        const obj = clampInt(safeNum(a.scorta_obiettivo ?? 0));
        const disp = disponibili(a);
        const inArr = clampInt(safeNum(a.in_arrivo ?? 0));
        const deficit = Math.max(0, obj - (disp + inArr));
        return { a, obj, disp, inArr, deficit, stato: statoScorta(a) };
      })
      .filter((x) => x.deficit > 0)
      .sort((x, y) => y.deficit - x.deficit)
      .slice(0, 12);

    return { valoreMagazzino, valoreDisponibili, critici, topDeficit };
  }, [articoli]);

  // ===== Arrivi =====
  async function setInArrivo(id: string, qta: number) {
    const x = clampInt(qta);
    const { error } = await supabase.from("articoli").update({ in_arrivo: x }).eq("id", id);
    if (error) return alert(error.message);
    await loadArticoli();
  }

  async function segnaArrivato(id: string, qta: number) {
    const x = clampInt(qta);
    if (x <= 0) return;

    const a = articoli.find((z) => z.id === id);
    if (!a) return;

    const curArr = clampInt(safeNum(a.in_arrivo ?? 0));
    if (curArr <= 0) return;

    const take = Math.min(curArr, x);
    const nextArr = curArr - take;
    const nextFis = clampInt(safeNum(a.scatole_inventario)) + take;

    const { error } = await supabase
      .from("articoli")
      .update({ in_arrivo: nextArr, scatole_inventario: nextFis })
      .eq("id", id);

    if (error) return alert(error.message);

    await loadArticoli();
  }


  async function segnaCompletate() {
    if (completeBusy) return;
    setCompleteBusy(true);
    try {
      for (const [id, qty] of Object.entries(selectedCompletate || {})) {
        const qta = clampInt(Number(qty));
        if (qta <= 0) continue;

        const a = articoli.find(x => x.id === id);
        if (!a) continue;

        const imp = clampInt(safeNum(a.scatole_impegnate ?? 0));
        const inv = clampInt(safeNum(a.scatole_inventario ?? 0));

        if (qta > imp) throw new Error("QuantitÃ  superiore alle impegnate.");
        if (qta > inv) throw new Error("QuantitÃ  superiore al fisico.");

        const { error } = await supabase
          .from("articoli")
          .update({
            scatole_impegnate: imp - qta,
            scatole_inventario: inv - qta
          })
          .eq("id", id);

        if (error) throw error;
      }

      setSelectedCompletate({});
      await loadArticoli();
    } catch (e: any) {
      console.error(e);
      alert("Errore durante il completamento lavorazioni: " + (e?.message ?? String(e)));
    } finally {
      setCompleteBusy(false);
    }
  }
  // ===== UI =====
  function TopTabs() {
    const hasArrivi = (articoli || []).some(
      (a) => clampInt(safeNum((a as any)?.in_arrivo ?? 0)) > 0
    );

    return (
      <div className="flex items-center gap-2">
        {([
          ["magazzino", "Magazzino"],
          ["ordini", "Ordini"],
          ["arrivi", "Arrivi"],
          ["dashboard", "Dashboard"],
        ["completate", "Completate"],
        ] as Array<[Tab, string]>).filter(([k]) => k !== "arrivi" || hasArrivi).map(([k, label]) => (
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

  // ===== Dettaglio editor (sempre modificabile) =====
  const [detForm, setDetForm] = useState<any>(null);
  const [detDirty, setDetDirty] = useState(false);
  const [detSaving, setDetSaving] = useState(false);

  useEffect(() => {
    if (!selected) { setDetForm(null); setDetDirty(false); return; }
    setDetForm({ ...selected });
    setDetDirty(false);
  }, [selected]);

  function setDet(key: string, value: any) {
    setDetForm((prev: any) => ({ ...(prev || {}), [key]: value }));
    setDetDirty(true);
  }

  async function salvaDettaglio() {
    if (!selected || !detForm) return;
    setDetSaving(true);
    try {
      const payload: any = {
        descrizione: String(detForm.descrizione ?? ""),
        cod_articolo: String(detForm.cod_articolo ?? ""),
        pz_per_scatola: clampInt(safeNum(detForm.pz_per_scatola ?? 0)),
        prezzo_costo: safeNum(String(detForm.prezzo_costo ?? "0").replace(",", ".")),
        scorta_minima: clampInt(safeNum(detForm.scorta_minima ?? 0)),
        scorta_obiettivo: clampInt(safeNum(detForm.scorta_obiettivo ?? 0)),
        visibile_magazzino: !!detForm.visibile_magazzino,
        scatole_inventario: clampInt(safeNum(detForm.scatole_inventario ?? 0)),
        scatole_impegnate: clampInt(safeNum(detForm.scatole_impegnate ?? 0)),
        in_arrivo: clampInt(safeNum(detForm.in_arrivo ?? 0)),
      };
      const { error } = await supabase.from("articoli").update(payload).eq("id", selected.id);
      if (error) { alert(error.message); return; }
      await loadArticoli();
      setDetDirty(false);
    } finally {
      setDetSaving(false);
    }
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
              <img src="/domobags-logo.png" alt="Logo" className="h-full w-full object-contain min-w-0" />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight text-neutral-900">
                Magazzino
              </div>
              <div className="text-xs text-neutral-500">{topBarSubtitle()}</div>
            </div>
          </div>

          <TopTabs />
        
      {/* ADMIN_CREATE_ARTICOLO_PATCH_UI */}
      {(
        <div className="mt-3 mx-auto max-w-6xl px-4">
          <div className="flex items-center justify-end">
            
          </div>
        </div>
      )}

      {openNewArt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-xl min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">Nuovo articolo</div>
                <div className="text-xs text-neutral-500">Visibile solo in modalitÃƒ  admin ()</div>
              </div>
              <button
                onClick={() => setOpenNewArt(false)}
                className="rounded-2xl px-3 py-2 text-sm font-semibold border border-neutral-200 bg-white"
              >
                Chiudi
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <div>
                <div className="text-xs font-semibold text-neutral-700">Codice / Misura</div>
                <input
                  value={newCod}
                  onChange={(e) => setNewCod(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 min-w-0"
                  placeholder="es. 32x45 / COD123"
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-neutral-700">Descrizione</div>
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 min-w-0"
                  placeholder="es. Shopper carta avana..."
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-neutral-700">Scorta minima</div>
                <input
                  type="number"
                  value={newMin}
                  onChange={(e) => setNewMin(Number(e.target.value))}
                  className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 min-w-0"
                />
              </div>

              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  onClick={() => setOpenNewArt(false)}
                  className="rounded-2xl px-4 py-2 text-sm font-semibold border border-neutral-200 bg-white"
                >
                  Annulla
                </button>

                <button
                  onClick={async () => {
                    try {
                      const cod = (newCod || "").trim();
                      const desc = (newDesc || "").trim();
                      const min = Number(newMin || 0);

                      if (!cod || !desc) {
                        alert("Codice e descrizione sono obbligatori.");
                        return;
                      }

                      // Inserimento base: inventario=0, impegnate=0, in_arrivo=0
                      const payload: any = {
                        cod_articolo: cod,
                        descrizione: desc,
                        scorta_minima: min,
                        scatole_inventario: 0,
                        scatole_impegnate: 0,
                        in_arrivo: 0,
                      };

                      const { data, error } = await supabase
                        .from("articoli")
                        .insert([payload])
                        .select()
                        .single();

                      if (error) throw error;

                      // Aggiorna UI locale
                      setArticoli((prev: any) => [data, ...(prev || [])]);
                      setSelected(data);
                      setOpenNewArt(false);
                      setNewCod("");
                      setNewDesc("");
                      setNewMin(0);
                    } catch (e: any) {
                      console.error(e);
                      alert("Errore inserimento articolo: " + (e?.message ?? String(e)));
                    }
                  }}
                  className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm"
                  style={{ backgroundColor: ACCENT }}
                >
                  Salva
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
</div>

        {tab === "magazzino" && (
          <div className="mx-auto max-w-6xl px-4 pb-3 hidden">
            <div className="rounded-2xl border px-4 py-3 text-sm hidden" style={{ borderColor: "rgba(44,184,179,0.35)", background: "rgba(44,184,179,0.06)" }}>
              <div className="font-semibold text-neutral-900 hidden">Nota per la diabolica mamma</div>
              <div className="text-neutral-700">
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-neutral-600">
                  ModalitÃƒ  semplice: mostra solo disponibilitÃƒ  e pulsanti essenziali.
                </div>
                <button
                  onClick={() => { setSimpleView((v) => !v); setShowAdvanced(true); }}
                  className="rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow-sm hidden hidden"
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
              placeholder="Cerca per misura/codice o descrizioneÃ¢€¦"
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-neutral-400 min-w-0"
            />
          </div>
        )}

        {/* MAGAZZINO */}
        {tab === "magazzino" && (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_360px] items-start min-w-0">
            {/* UI_QUICK_ADD_ARTICOLO */}
            <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm min-w-0 md:sticky md:top-[92px] h-[calc(100vh-170px)] h-[calc(100vh-170px)] overflow-auto">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">Articoli</h2>
                <span className="text-xs text-neutral-500">{loading ? "Ã¢€¦" : `${soloMagazzino.length} tot`}</span>
              </div>

              {loading ? (
                <p className="text-sm text-neutral-500">CaricamentoÃ¢€¦</p>
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
                      <div className="flex w-full items-center justify-between gap-4 min-w-0">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-neutral-900">{a.descrizione}</div>
                          <div className="text-xs text-neutral-500">{a.cod_articolo}</div>
                        </div>
                      
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-2xl px-3 py-2" style={{ background: "rgba(44,184,179,0.14)" }}>
                            <div className="text-[10px] uppercase tracking-wide text-neutral-700">Magazzino</div>
                            <div className="text-2xl font-extrabold" style={{ color: ACCENT }}>
                              {clampInt(safeNum(a.scatole_inventario))}
                            </div>
                          </div>
                      
                          <div className="rounded-2xl px-3 py-2" style={{ background: "rgba(234,179,8,0.20)" }}>
                            <div className="text-[10px] uppercase tracking-wide text-neutral-700">Impegnate</div>
                            <div className="text-2xl font-extrabold" style={{ color: "rgb(161 98 7)" }}>
                              {clampInt(safeNum(a.scatole_impegnate))}
                            </div>
                          </div>
                      
                          <div className="rounded-2xl px-3 py-2" style={{ background: "rgba(59,130,246,0.18)" }}>
                            <div className="text-[10px] uppercase tracking-wide text-neutral-700">In arrivo</div>
                            <div className="text-2xl font-extrabold" style={{ color: "rgb(29 78 216)" }}>
                              {clampInt(safeNum(a.in_arrivo))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
            <div className="sticky top-[84px] h-[calc(100vh-170px)] min-w-0 flex flex-col gap-4">
            <section className="rounded-3xl border border-neutral-200 bg-white p-3 shadow-sm min-w-0 overflow-hidden">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">Nuovo articolo</h2>
                <span className="text-xs text-neutral-500">visibile a tutti</span>
              </div>

              <div className="grid gap-2">
                <div className="grid gap-2 md:grid-cols-1 items-start">
                  <input
                    value={qaCod}
                    onChange={(e) => setQaCod(e.target.value)}
                    placeholder="Misura / Codice (es. 32x42)"
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-neutral-400 min-w-0"
                  />
                  <input
                    value={qaDesc}
                    onChange={(e) => setQaDesc(e.target.value)}
                    placeholder="Descrizione"
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-neutral-400 min-w-0"
                  />
                </div>

                <div className="grid gap-2 grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs text-neutral-500">Scorta minima</div>
                    <input
                      type="number"
                      value={qaMin}
                      onChange={(e) => setQaMin(parseInt(String((e.target as any)?.value ?? "0").replace(/[^\d-]/g,"") || "0", 10) || 0)}
                      className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm outline-none min-w-0"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-neutral-500">Magazzino</div>
                    <input
                      type="number"
                      value={qaInv}
                      onChange={(e) => setQaInv(Number(e.target.value))}
                      className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm outline-none min-w-0"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-neutral-500">Impegnate</div>
                    <input
                      type="number"
                      value={qaImp}
                      onChange={(e) => setQaImp(Number(e.target.value))}
                      className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm outline-none min-w-0"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-neutral-500">In arrivo</div>
                    <input
                      type="number"
                      value={qaArr}
                      onChange={(e) => setQaArr(Number(e.target.value))}
                      className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm outline-none min-w-0"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-neutral-500">Pz/scatola</div>
                    <input
                      type="number"
                      value={qaPz}
                      onChange={(e) => setQaPz(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm outline-none min-w-0"
                    />
                  </div>
                </div>

                <button
                  onClick={quickAddArticolo}
                  disabled={qaBusy}
                  className="rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
                  style={{ backgroundColor: ACCENT }}
                >
                  {qaBusy ? "Aggiungo..." : "Aggiungi articolo"}
                </button>
              </div>
            </section>
            <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm min-w-0 flex-1 overflow-auto">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Dettaglio</h2>
                <button
                  onClick={salvaDettaglio}
                  disabled={!selected || !detDirty || detSaving}
                  className="rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                  style={{ backgroundColor: ACCENT }}
                >
                  {detSaving ? "Salvo..." : (detDirty ? "Salva modifiche" : "Salvato")}
                </button>
              </div>

              {!selected ? (
                <p className="text-sm text-neutral-500">Seleziona un articolo dalla lista.</p>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 space-y-3">
                    <div className="grid gap-2">
                      <div>
                        <div className="text-xs text-neutral-500">Descrizione</div>
                        <input
                          value={String(detForm?.descrizione ?? "")}
                          onChange={(e) => setDet("descrizione", e.target.value)}
                          className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-neutral-400 min-w-0"
                        />
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500">Codice / Misura</div>
                        <input
                          value={String(detForm?.cod_articolo ?? "")}
                          onChange={(e) => setDet("cod_articolo", e.target.value)}
                          className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-neutral-400 min-w-0"
                        />

                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs text-neutral-500">Pezzi per scatola</div>
                        <input
                          type="number"
                          value={clampInt(safeNum(detForm?.pz_per_scatola ?? 0))}
                          onChange={(e) => setDet("pz_per_scatola", e.target.value)}
                          className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm outline-none min-w-0"
                        />
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500">Costo Ã¢â€š¬/scatola</div>
                        <input
                          inputMode="decimal"
                          value={String(detForm?.prezzo_costo ?? "")}
                          onChange={(e) => setDet("prezzo_costo", e.target.value.replace(/[^\d.,]/g,""))}
                          className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm outline-none min-w-0"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs text-neutral-500">Scorta minima</div>
                        <input
                          type="number"
                          value={clampInt(safeNum(detForm?.scorta_minima ?? 0))}
                          onChange={(e) => setDet("scorta_minima", e.target.value)}
                          className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm outline-none min-w-0"
                        />
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500">Scorta obiettivo</div>
                        <input
                          type="number"
                          value={clampInt(safeNum(detForm?.scorta_obiettivo ?? 0))}
                          onChange={(e) => setDet("scorta_obiettivo", e.target.value)}
                          className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm outline-none min-w-0"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <div className="text-xs text-neutral-500">Fisico</div>
                        <input
                          type="number"
                          value={clampInt(safeNum(detForm?.scatole_inventario ?? 0))}
                          onChange={(e) => setDet("scatole_inventario", e.target.value)}
                          className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm outline-none min-w-0"
                        />
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500">Impegnate</div>
                        <input
                          type="number"
                          value={clampInt(safeNum(detForm?.scatole_impegnate ?? 0))}
                          onChange={(e) => setDet("scatole_impegnate", e.target.value)}
                          className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm outline-none min-w-0"
                        />
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500">In arrivo</div>
                        <input
                          type="number"
                          value={clampInt(safeNum(detForm?.in_arrivo ?? 0))}
                          onChange={(e) => setDet("in_arrivo", e.target.value)}
                          className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm outline-none min-w-0"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-3">
                      <div>
                        <div className="text-sm font-semibold">Visibile in Magazzino</div>
                        <div className="text-xs text-neutral-500">Se disattivi, resta solo per te (Ordini)</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={!!detForm?.visibile_magazzino}
                        onChange={(e) => setDet("visibile_magazzino", e.target.checked)}
                        className="h-5 w-5"
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 p-3">
                    <label className="block text-xs text-neutral-500">Carico / Scarico (fisico)</label>
                    <input
                      value={deltaFisico}
                      onChange={(e) => setDeltaFisico(e.target.value.replace(/[^\d]/g, ""))}
                      inputMode="numeric"
                      placeholder="es. 2"
                      className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-neutral-400 min-w-0"
                    />
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => applyDeltaFisico("+")}
                        className="rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
                        style={{ backgroundColor: ACCENT }}
                      >
                        + Carico
                      </button>
                      <button
                        onClick={() => applyDeltaFisico("-")}
                        className="rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm active:scale-[0.99]"
                      >
                        Ã¢Ë†’ Scarico
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 p-3">
                    <label className="block text-xs text-neutral-500">Scatole impegnate (promemoria ordini)</label>
                    <input
                      value={deltaImp}
                      onChange={(e) => setDeltaImp(e.target.value.replace(/[^\d]/g, ""))}
                      inputMode="numeric"
                      placeholder="es. 5"
                      className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-neutral-400 min-w-0"
                    />
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => applyDeltaImpegnate("+")}
                        className="rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
                        style={{ backgroundColor: ACCENT }}
                      >
                        + Applica
                      </button>
                      <button
                        onClick={() => applyDeltaImpegnate("-")}
                        className="rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm active:scale-[0.99]"
                      >
                        Ã¢Ë†’ Applica
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
            </div>
          </div>
        )}

        {/* ORDINI */}
        {tab === "ordini" && (
          <div className="grid gap-4 md:grid-cols-[420px_1fr] items-start">
            <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm min-w-0 overflow-hidden">
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
                  Nessun suggerimento (serve impostare una Ã¢€Å“scorta obiettivoÃ¢€ negli articoli).
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
                            Disponibili: {disponibili(a)} Ã¢€¢ In arrivo: {clampInt(safeNum(a.in_arrivo ?? 0))} Ã¢€¢ Obiettivo: {clampInt(safeNum(a.scorta_obiettivo ?? 0))}
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
                          Aggiungi allÃ¢€â„¢ordine
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm min-w-0 overflow-hidden">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">Carrello ordine</h2>
                <button
                  onClick={() => confermaOrdine(articoli, carrello, loadArticoli, setCarrello)}
                  className="rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow-sm"
                  style={{ backgroundColor: ACCENT }}
                >
                  Conferma ordine
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
                            {qta} scatole Ã¢€¢ {qta * clampInt(safeNum(a.pz_per_scatola))} pezzi
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold">{fmtEur(qta * safeNum(a.prezzo_costo ?? 0))}</div>
                          <div className="text-xs text-neutral-500">stimato</div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="text-xs text-neutral-500">
                          Modifica quantitÃƒ  (scatole)
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCarrelloQty(a.id, qta - 1)}
                            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold"
                          >
                            Ã¢Ë†’
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

        {/* ARRIVI */}
        {tab === "arrivi" && (
          <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm min-w-0 overflow-hidden">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Arrivi</h2>
              <div className="text-xs text-neutral-500">
                Totale in arrivo: <span className="font-semibold">{inArrivoTot()}</span> scatole
              </div>
            </div>

            <p className="text-sm text-neutral-500">
              Qui segni quante scatole sono <span className="font-semibold">in arrivo</span>. Quando arrivano, premi
              Ã¢€Å“Segna arrivatoÃ¢€: le sposta nel fisico da sola.
            </p>

            <div className="mt-4 space-y-2">
              {inArrivoTot() <= 0 ? (
                <p className="text-sm text-neutral-500">Nessun articolo.</p>
              ) : (
                filtered.filter((a) => clampInt(safeNum(a.in_arrivo ?? 0)) > 0).map((a) => {
                  const arr = clampInt(safeNum(a.in_arrivo ?? 0));
                  return (
                    <div key={a.id} className="rounded-2xl border border-neutral-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">{a.descrizione}</div>
                          <div className="text-xs text-neutral-500">{a.cod_articolo}</div>
                          <div className="mt-1 text-xs text-neutral-500">
                            Fisico: {clampInt(safeNum(a.scatole_inventario))} Ã¢€¢ Impegnate: {clampInt(safeNum(a.scatole_impegnate ?? 0))} Ã¢€¢ Disponibili: {disponibili(a)}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-lg font-semibold">{arr}</div>
                          <div className="text-xs text-neutral-500">in arrivo</div>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 md:grid-cols-3">
                        <div className=" min-w-0 overflow-hidden md:col-span-2 min-w-0 overflow-hidden">
                          <div className="text-xs text-neutral-500">Imposta in arrivo (scatole)</div>
                          <input
                            defaultValue={String(arr)}
                            onBlur={(e) => setInArrivo(a.id, parseInt((e.target.value || "0").replace(/[^\d]/g, ""), 10))}
                            inputMode="numeric"
                            className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-neutral-400 min-w-0"
                          />
                          <div className="mt-1 text-xs text-neutral-400 hidden">
                            (Scrivi e poi esci dal campo: salva da solo, cosÃƒ¬ la mamma non deve premere 12 bottoni.)
                          </div>
                        </div>

                        <div className="flex flex-col justify-end gap-2">
                          <button
                            onClick={() => segnaArrivato(a.id, 999999)}
                            disabled={arr <= 0}
                            className="rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
                            style={{ backgroundColor: ACCENT }}
                          >
                            Segna arrivato
                          </button>
                          <button
                            onClick={() => setInArrivo(a.id, 0)}
                            className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 shadow-sm"
                          >
                            Azzera
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

              {/* COMPLETATE */}
      {tab === "completate" && (
        <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm min-w-0 overflow-hidden">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">In lavorazione</h2>
            <div className="text-xs text-neutral-500">
              Totale lavorazioni: <span className="font-semibold">{articoliImpegnati.length}</span>
            </div>
          </div>

          {articoliImpegnati.length === 0 ? (
            <p className="text-sm text-neutral-500">Nessuna lavorazione in corso.</p>
          ) : (
            <>
              <div className="space-y-2">
                {articoliImpegnati.map((a) => {
                  const max = clampInt(safeNum(a.scatole_impegnate ?? 0));
                  const checked = Object.prototype.hasOwnProperty.call(selectedCompletate, a.id);
                  const val = clampInt(safeNum((selectedCompletate as any)[a.id] ?? max));
                  return (
                    <div key={a.id} className="rounded-2xl border border-neutral-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const on = e.target.checked;
                              setSelectedCompletate((prev) => {
                                const next = { ...(prev || {}) } as any;
                                if (on) next[a.id] = max;
                                else delete next[a.id];
                                return next;
                              });
                            }}
                            className="mt-1 h-5 w-5"
                          />
                          <div>
                            <div className="text-sm font-semibold">{a.descrizione}</div>
                            <div className="text-xs text-neutral-500">{a.cod_articolo}</div>
                            <div className="mt-1 text-xs text-neutral-500">
                              Impegnate: <span className="font-semibold">{max}</span> â€¢ Fisico: {clampInt(safeNum(a.scatole_inventario))}
                            </div>
                          </div>
                        </div>

                        <div className="w-28">
                          <div className="text-xs text-neutral-500">Da scalare</div>
                          <input
                            type="number"
                            min={0}
                            max={max}
                            disabled={!checked}
                            value={val}
                            onChange={(e) =>
                              setSelectedCompletate((prev) => ({
                                ...(prev || {}),
                                [a.id]: clampInt(Number((e.target.value || "0").toString().replace(/[^\d]/g, "")))
                              }))
                            }
                            className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm outline-none disabled:opacity-50"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-end">
                <button
                  onClick={segnaCompletate}
                  disabled={completeBusy || Object.keys(selectedCompletate || {}).length === 0}
                  className="rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                  style={{ backgroundColor: ACCENT }}
                >
                  {completeBusy ? "Segno..." : "Segna completate"}
                </button>
              </div>
            </>
          )}
        </section>
      )}
      {/* DASHBOARD */}
        {tab === "dashboard" && (
          <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm min-w-0 overflow-hidden">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Dashboard</h2>
              <div className="text-xs text-neutral-500">Numeri e prioritÃƒ  (senza fronzoli, ma con stile)</div>
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
                <div className="text-xs text-neutral-500">Critici</div>
                <div className="text-xl font-semibold">{dash.critici.length}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[420px_1fr]">
              <div className="rounded-3xl border border-neutral-200 bg-white p-4">
                <div className="mb-2 text-sm font-semibold">Articoli critici</div>
                {dash.critici.length === 0 ? (
                  <p className="text-sm text-neutral-500">Nessun critico. Miracolo.</p>
                ) : (
                  <div className="space-y-2">
                    {dash.critici.map((a) => (
                      <div key={a.id} className={`rounded-2xl border border-neutral-200 p-3 ${cardClass(a)}`}>
                        <div className="text-sm font-semibold">{a.descrizione}</div>
                        <div className="text-xs text-neutral-500">{a.cod_articolo}</div>
                        <div className="mt-1 text-xs text-neutral-500">
                          Disponibili: {disponibili(a)} Ã¢€¢ Fisico: {clampInt(safeNum(a.scatole_inventario))} Ã¢€¢ Impegnate: {clampInt(safeNum(a.scatole_impegnate ?? 0))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-neutral-200 bg-white p-4">
                <div className="mb-2 text-sm font-semibold">Top da ordinare (deficit vs obiettivo)</div>
                {dash.topDeficit.length === 0 ? (
                  <p className="text-sm text-neutral-500">Nessun deficit (o non hai obiettivi impostati).</p>
                ) : (
                  <div className="space-y-2">
                    {dash.topDeficit.map((x) => (
                      <div key={x.a.id} className={`rounded-2xl border border-neutral-200 p-3 ${x.stato === "critico" ? "card-critico" : x.stato === "basso" ? "card-basso" : ""}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold">{x.a.descrizione}</div>
                            <div className="text-xs text-neutral-500">{x.a.cod_articolo}</div>
                            <div className="mt-1 text-xs text-neutral-500">
                              Disponibili {x.disp} Ã¢€¢ In arrivo {x.inArr} Ã¢€¢ Obiettivo {x.obj}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-semibold">{x.deficit}</div>
                            <div className="text-xs text-neutral-500">scatole</div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <div className="text-xs text-neutral-500">
                            Costo stimato: {fmtEur(x.deficit * safeNum(x.a.prezzo_costo ?? 0))}
                          </div>
                          <button
                            onClick={() => setCarrelloQty(x.a.id, x.deficit)}
                            className="rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow-sm"
                            style={{ backgroundColor: ACCENT }}
                          >
                            Aggiungi al carrello
                          </button>
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
      
  /* __CP_STOCK_COLORS__ */
  .card-critico{
    border-color: rgba(239,68,68,0.90) !important;
    box-shadow: 0 0 0 2px rgba(239,68,68,0.20) inset !important;
    background: rgba(254,226,226,0.92) !important;
  }
  .card-basso{
    border-color: rgba(234,179,8,0.95) !important;
    box-shadow: 0 0 0 2px rgba(234,179,8,0.18) inset !important;
    background: rgba(254,243,199,0.92) !important;
  }
  .card-ok{
    border-color: rgba(16,185,129,0.70) !important;
    box-shadow: 0 0 0 2px rgba(16,185,129,0.14) inset !important;
    background: rgba(209,250,229,0.75) !important;
  }
`}</style>
    </main>
  );
}













