"use client";

import { useEffect, useMemo, useState } from "react";
import Topbar from "../components/Topbar";
import { getSupabase } from "../../lib/supabaseClient";

type Cliente = { id: string; [k: string]: any };
type Articolo = { id: string; [k: string]: any };

type RigaDraft = {
  articolo_id: string;
  scatole: number;
};

function pickFirst(obj: any, keys: string[]) {
  for (const k of keys) {
    if (obj && obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
  }
  return "";
}

function clienteLabel(c: Cliente) {
  return String(pickFirst(c, ["nome", "ragione_sociale", "cliente", "name"]));
}
function articoloCode(a: Articolo) {
  return String(pickFirst(a, ["cod_articolo", "codice", "misura", "sku", "nome"]));
}
function articoloDesc(a: Articolo) {
  return String(pickFirst(a, ["descrizione", "descr", "nome", "name"]));
}

export default function Page() {
  const sb = getSupabase();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [articoli, setArticoli] = useState<Articolo[]>([]);

  const [clienteId, setClienteId] = useState("");
  const [filterCli, setFilterCli] = useState("");
  const [filterArt, setFilterArt] = useState("");

  const [righe, setRighe] = useState<RigaDraft[]>([{ articolo_id: "", scatole: 1 }]);
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    setErr("");
    setLoading(true);
    try {
      const { data: c, error: ec } = await sb.from("clienti").select("*").order("created_at", { ascending: false });
      if (ec) throw ec;

      const { data: a, error: ea } = await sb.from("articoli").select("*").eq("visibile_magazzino", true).order("created_at", { ascending: false });
      if (ea) throw ea;

      setClienti(c ?? []);
      setArticoli(a ?? []);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  const clientiFiltered = useMemo(() => {
    const q = filterCli.trim().toLowerCase();
    if (!q) return clienti;
    return clienti.filter(c => (clienteLabel(c) + " " + c.id).toLowerCase().includes(q));
  }, [clienti, filterCli]);

  const articoliFiltered = useMemo(() => {
    const q = filterArt.trim().toLowerCase();
    if (!q) return articoli;
    return articoli.filter(a => (articoloCode(a) + " " + articoloDesc(a) + " " + a.id).toLowerCase().includes(q));
  }, [articoli, filterArt]);

  function setRiga(i: number, patch: Partial<RigaDraft>) {
    setRighe(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRiga() {
    setRighe(prev => [...prev, { articolo_id: "", scatole: 1 }]);
  }
  function removeRiga(i: number) {
    setRighe(prev => prev.filter((_, idx) => idx !== i));
  }

  async function confirmOrder() {
    setErr("");

    if (!clienteId) { setErr("Seleziona un cliente."); return; }
    const clean = righe
      .map(r => ({ ...r, scatole: Number(r.scatole) || 0 }))
      .filter(r => r.articolo_id && r.scatole > 0);

    if (clean.length === 0) { setErr("Aggiungi almeno una riga valida."); return; }

    setSaving(true);
    try {
      const { data: ord, error: eo } = await sb
        .from("ordini")
        .insert({ cliente_id: clienteId, stato: "IMPEGNATO" })
        .select("id")
        .single();

      if (eo) throw eo;
      const ordineId = ord.id as string;

      const righeInsert = clean.map(r => ({
        ordine_id: ordineId,
        articolo_id: r.articolo_id,
        scatole: r.scatole,
        stato: "IMPEGNATO",
      }));

      const { data: righeDb, error: er } = await sb
        .from("ordini_righe")
        .insert(righeInsert)
        .select("id, articolo_id, scatole");

      if (er) throw er;

      const sums = new Map<string, number>();
      for (const rr of (righeDb ?? [])) {
        sums.set(rr.articolo_id, (sums.get(rr.articolo_id) ?? 0) + Number(rr.scatole || 0));
      }

      for (const [artId, qty] of sums.entries()) {
        const { data: art, error: ega } = await sb
          .from("articoli")
          .select("id, scatole_impegnate, impegnate")
          .eq("id", artId)
          .single();

        if (ega) throw ega;

        const nextScIm = Number(art?.scatole_impegnate ?? 0) + qty;
        const nextImp  = (art?.impegnate == null) ? undefined : (Number(art.impegnate) + qty);

        const patch: any = { scatole_impegnate: nextScIm };
        if (nextImp !== undefined) patch.impegnate = nextImp;

        const { error: eu } = await sb.from("articoli").update(patch).eq("id", artId);
        if (eu) throw eu;
      }

      setClienteId("");
      setRighe([{ articolo_id: "", scatole: 1 }]);
      await loadAll();
      setErr("OK: ordine creato e spostato in Impegnate.");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Topbar />
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-2xl font-bold">Ordini clienti</h1>
        <p className="text-gray-600 mt-1">Quando confermi, l'ordine va direttamente nelle <b>Impegnate</b>.</p>

        {err && (
          <div className={"mt-4 rounded-lg border p-3 " + (err.startsWith("OK:") ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700")}>
            {err}
          </div>
        )}

        <div className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-semibold text-gray-700">Cerca cliente</div>
              <input className="w-full rounded-xl border px-4 py-3" placeholder="Scrivi per filtrare (nome o id)" value={filterCli} onChange={(e) => setFilterCli(e.target.value)} />
              <div className="mt-3 mb-2 text-sm font-semibold text-gray-700">Cliente</div>
              <select className="w-full rounded-xl border px-4 py-3" value={clienteId} onChange={(e) => setClienteId(e.target.value)} disabled={loading || saving}>
                <option value="">Seleziona cliente...</option>
                {clientiFiltered.map((c) => (
                  <option key={c.id} value={c.id}>
                    {clienteLabel(c)} ({c.id.slice(0, 8)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold text-gray-700">Cerca articolo</div>
              <input className="w-full rounded-xl border px-4 py-3" placeholder="Scrivi per filtrare (codice o descrizione)" value={filterArt} onChange={(e) => setFilterArt(e.target.value)} />
              <div className="mt-3 text-sm text-gray-500">{loading ? "Carico..." : `${articoliFiltered.length} articoli visibili`}</div>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-gray-800">Righe ordine</div>
              <button className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-gray-50" onClick={addRiga} disabled={saving}>+ Aggiungi riga</button>
            </div>

            <div className="mt-4 space-y-3">
              {righe.map((r, i) => (
                <div key={i} className="grid gap-3 md:grid-cols-[1fr_140px_120px] items-center">
                  <select className="w-full rounded-xl border px-4 py-3" value={r.articolo_id} onChange={(e) => setRiga(i, { articolo_id: e.target.value })} disabled={loading || saving}>
                    <option value="">Seleziona articolo...</option>
                    {articoliFiltered.map((a) => (
                      <option key={a.id} value={a.id}>
                        {articoloCode(a)} - {articoloDesc(a)}
                      </option>
                    ))}
                  </select>

                  <input className="w-full rounded-xl border px-4 py-3" type="number" min={1} value={r.scatole} onChange={(e) => setRiga(i, { scatole: Number(e.target.value) })} disabled={saving} />

                  <button className="rounded-xl border px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50" onClick={() => removeRiga(i)} disabled={saving || righe.length === 1}>
                    Rimuovi
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button className="rounded-xl border px-4 py-3 text-sm font-semibold hover:bg-gray-50" onClick={loadAll} disabled={saving}>Aggiorna dati</button>
              <button className="rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50" onClick={confirmOrder} disabled={saving || loading}>
                {saving ? "Salvo..." : "Conferma ordine → Impegnate"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}