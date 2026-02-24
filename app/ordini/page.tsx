'use client';

import { useEffect, useMemo, useState } from 'react';
import DomobagsHeader from '../../components/DomobagsHeader';
import { supabase } from '../../lib/supabaseClient';

export const dynamic = 'force-dynamic';

type Cliente = { id: string; nome: string };
type ArticoloRow = { id: string; codice?: string | null; misura?: string | null; descrizione?: string | null };

type Riga = { articolo_id: string; scatole: number };

function labelArticolo(a: ArticoloRow): string {
  const parts = [a.codice, a.misura, a.descrizione].filter(Boolean);
  if (parts.length > 0) return parts.join(' • ');
  return a.id;
}

export default function OrdiniPage() {
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [articoli, setArticoli] = useState<ArticoloRow[]>([]);
  const [clienteId, setClienteId] = useState<string>('');
  const [righe, setRighe] = useState<Riga[]>([{ articolo_id: '', scatole: 1 }]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function loadClienti() {
    const { data, error } = await supabase.from('clienti').select('id, nome').order('nome', { ascending: true });
    if (error) {
      setMsg('Errore lettura clienti: ' + error.message);
      setClienti([]);
      return;
    }
    setClienti((data ?? []) as Cliente[]);
  }

  async function loadArticoli() {
    // Tentativo 1: colonne "comode"
    let res = await supabase.from('articoli').select('id, codice, misura, descrizione').order('codice', { ascending: true }).limit(2000);
    if (res.error) {
      // Fallback: prendi almeno id + tutto (se esiste)
      const res2 = await supabase.from('articoli').select('*').limit(2000);
      if (res2.error) {
        setMsg('Errore lettura articoli: ' + res2.error.message);
        setArticoli([]);
        return;
      }
      const mapped = (res2.data ?? []).map((x: any) => ({
        id: String(x.id),
        codice: x.codice ?? x.code ?? x.sku ?? null,
        misura: x.misura ?? x.misura_codice ?? x.nome ?? null,
        descrizione: x.descrizione ?? x.description ?? null
      })) as ArticoloRow[];
      setArticoli(mapped);
      return;
    }

    setArticoli((res.data ?? []) as ArticoloRow[]);
  }

  async function loadAll() {
    setMsg(null);
    await Promise.all([loadClienti(), loadArticoli()]);
  }

  useEffect(() => { loadAll(); }, []);

  const canConfirm = useMemo(() => {
    if (!clienteId) return false;
    if (righe.length === 0) return false;
    for (const r of righe) {
      if (!r.articolo_id) return false;
      if (!Number.isFinite(r.scatole) || r.scatole <= 0) return false;
    }
    return true;
  }, [clienteId, righe]);

  function addRiga() {
    setRighe((prev) => [...prev, { articolo_id: '', scatole: 1 }]);
  }
  function removeRiga(idx: number) {
    setRighe((prev) => prev.filter((_, i) => i !== idx));
  }
  function setRiga(idx: number, patch: Partial<Riga>) {
    setRighe((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function confermaOrdine() {
    if (!canConfirm) return;

    setLoading(true);
    setMsg(null);

    // 1) crea ordine
    const { data: ordineRow, error: errOrd } = await supabase
      .from('ordini')
      .insert({ cliente_id: clienteId, stato: 'CREATO' })
      .select('id')
      .single();

    if (errOrd || !ordineRow?.id) {
      setLoading(false);
      setMsg('Errore creazione ordine: ' + (errOrd?.message ?? 'unknown'));
      return;
    }

    const ordineId = ordineRow.id as string;

    // 2) crea righe
    const payload = righe.map((r) => ({
      ordine_id: ordineId,
      articolo_id: r.articolo_id,
      scatole: r.scatole
    }));

    const { error: errRighe } = await supabase.from('ordini_righe').insert(payload);

    setLoading(false);

    if (errRighe) {
      setMsg('Ordine creato, ma errore righe: ' + errRighe.message);
      return;
    }

    setMsg('Ordine confermato.');
    setClienteId('');
    setRighe([{ articolo_id: '', scatole: 1 }]);
  }

  return (
    <>
      <DomobagsHeader active="ordini" />
      <main className="mx-auto max-w-6xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Ordini</h1>
            <p className="mt-2 text-sm text-neutral-600">
              Seleziona cliente e righe. Poi “Conferma ordine” scrive su <span className="font-semibold">ordini</span> e <span className="font-semibold">ordini_righe</span>.
            </p>
          </div>

          <button
            onClick={loadAll}
            disabled={loading}
            className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-semibold hover:bg-neutral-50"
          >
            Aggiorna dati
          </button>
        </div>

        {msg && (
          <div className="mt-6 rounded-xl bg-neutral-50 border border-neutral-200 px-4 py-3 text-sm text-neutral-700">
            {msg}
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <label className="block text-sm font-medium text-neutral-700">Cliente</label>
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:ring-2 focus:ring-teal-200 bg-white"
          >
            <option value="">Seleziona cliente…</option>
            {clienti.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </section>

        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-semibold">Righe ordine</h2>
            <button
              onClick={addRiga}
              className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-semibold hover:bg-neutral-50"
            >
              + Aggiungi riga
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {righe.map((r, idx) => (
              <div key={idx} className="rounded-2xl border border-neutral-200 p-4">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-3 items-end">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700">Articolo</label>
                    <select
                      value={r.articolo_id}
                      onChange={(e) => setRiga(idx, { articolo_id: e.target.value })}
                      className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:ring-2 focus:ring-teal-200 bg-white"
                    >
                      <option value="">Seleziona articolo…</option>
                      {articoli.map((a) => (
                        <option key={a.id} value={a.id}>{labelArticolo(a)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700">Scatole</label>
                    <input
                      type="number"
                      min={1}
                      value={r.scatole}
                      onChange={(e) => setRiga(idx, { scatole: Number(e.target.value) || 1 })}
                      className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:ring-2 focus:ring-teal-200"
                    />
                  </div>

                  <button
                    onClick={() => removeRiga(idx)}
                    disabled={righe.length === 1}
                    className={[
                      'rounded-xl px-4 py-3 text-sm font-semibold transition',
                      righe.length === 1 ? 'bg-neutral-100 text-neutral-400' : 'border border-neutral-200 hover:bg-neutral-50'
                    ].join(' ')}
                  >
                    Rimuovi
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-end">
            <button
              onClick={confermaOrdine}
              disabled={!canConfirm || loading}
              className={[
                'rounded-xl px-6 py-3 font-semibold transition',
                (!canConfirm || loading) ? 'bg-neutral-100 text-neutral-400' : 'bg-teal-600 text-white hover:bg-teal-700'
              ].join(' ')}
            >
              Conferma ordine
            </button>
          </div>
        </section>

        <p className="mt-6 text-xs text-neutral-500">
          Nota: se dropdown vuoti, significa che <span className="font-semibold">clienti</span> o <span className="font-semibold">articoli</span> sono vuoti o che le env vars su Vercel non combaciano.
        </p>
      </main>
    </>
  );
}