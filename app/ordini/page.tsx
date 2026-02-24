'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Cliente = { id: string; nome: string };
type Articolo = { id: string; codice?: string | null; descrizione?: string | null; magazzino?: number | null; impegnate?: number | null };

type RigaDraft = { articolo_id: string; scatole: number };

export default function OrdiniPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [articoli, setArticoli] = useState<Articolo[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [righe, setRighe] = useState<RigaDraft[]>([{ articolo_id: '', scatole: 1 }]);

  const articoliById = useMemo(() => {
    const m = new Map<string, Articolo>();
    articoli.forEach(a => m.set(a.id, a));
    return m;
  }, [articoli]);

  async function loadAll() {
    setLoading(true);
    setErr(null);
    try {
      const { data: cData, error: cErr } = await supabase
        .from('clienti')
        .select('id,nome')
        .order('nome', { ascending: true });
      if (cErr) throw cErr;

      const { data: aData, error: aErr } = await supabase
        .from('articoli')
        .select('id,codice,descrizione,magazzino,impegnate')
        .order('codice', { ascending: true });
      if (aErr) throw aErr;

      setClienti((cData ?? []) as Cliente[]);
      setArticoli((aData ?? []) as Articolo[]);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  function setRiga(i: number, patch: Partial<RigaDraft>) {
    setRighe(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addRiga() {
    setRighe(prev => [...prev, { articolo_id: '', scatole: 1 }]);
  }

  function removeRiga(i: number) {
    setRighe(prev => prev.filter((_, idx) => idx !== i));
  }

  function validate(): string | null {
    if (!clienteId) return 'Seleziona un cliente.';
    const cleaned = righe.filter(r => r.articolo_id && r.scatole > 0);
    if (cleaned.length === 0) return 'Aggiungi almeno una riga valida (articolo + scatole).';
    return null;
  }

  async function incImpegnate(articoloId: string, delta: number) {
    // Incremento "manuale" (select + update). Non è atomico al 100%, ma per ora funziona e non richiede migrazioni.
    const { data, error } = await supabase
      .from('articoli')
      .select('id,impegnate')
      .eq('id', articoloId)
      .single();
    if (error) throw error;
    const cur = (data?.impegnate ?? 0) as number;
    const next = cur + delta;
    const { error: uErr } = await supabase
      .from('articoli')
      .update({ impegnate: next })
      .eq('id', articoloId);
    if (uErr) throw uErr;
  }

  async function confermaOrdine() {
    setErr(null);
    setOk(null);

    const v = validate();
    if (v) { setErr(v); return; }

    const cleaned = righe.filter(r => r.articolo_id && r.scatole > 0);

    setSaving(true);
    try {
      // 1) crea ordine già IMPEGNATO
      const { data: oIns, error: oErr } = await supabase
        .from('ordini')
        .insert({ cliente_id: clienteId, stato: 'IMPEGNATO' })
        .select('id')
        .single();
      if (oErr) throw oErr;
      const ordineId = oIns.id as string;

      // 2) inserisci righe già IMPEGNATO
      const righePayload = cleaned.map(r => ({
        ordine_id: ordineId,
        articolo_id: r.articolo_id,
        scatole: r.scatole,
        stato: 'IMPEGNATO',
      }));
      const { error: rErr } = await supabase.from('ordini_righe').insert(righePayload);
      if (rErr) throw rErr;

      // 3) aggiorna articoli.impegnate
      for (const r of cleaned) {
        await incImpegnate(r.articolo_id, r.scatole);
      }

      setOk(`Ordine creato e messo in IMPEGNATE. ID: ${ordineId}`);
      // reset form
      setClienteId('');
      setRighe([{ articolo_id: '', scatole: 1 }]);
      await loadAll();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Nuovo ordine</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Quando confermi, l’ordine va direttamente nelle <b>Impegnate</b>.
        </p>
      </header>

      {err && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}
      {ok && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {ok}
        </div>
      )}

      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Cliente</label>
            <select
              className="w-full rounded-xl border border-neutral-200 p-3"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              disabled={loading || saving}
            >
              <option value="">Seleziona cliente...</option>
              {clienti.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-neutral-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">Righe ordine</div>
              <button
                type="button"
                onClick={addRiga}
                className="rounded-xl border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
                disabled={saving}
              >
                + Aggiungi riga
              </button>
            </div>

            <div className="space-y-3">
              {righe.map((r, i) => {
                const a = r.articolo_id ? articoliById.get(r.articolo_id) : null;
                const label = a ? `${a.codice ?? a.id} ${a.descrizione ? `- ${a.descrizione}` : ''}` : '';
                return (
                  <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                    <div className="md:col-span-8">
                      <select
                        className="w-full rounded-xl border border-neutral-200 p-3"
                        value={r.articolo_id}
                        onChange={(e) => setRiga(i, { articolo_id: e.target.value })}
                        disabled={loading || saving}
                      >
                        <option value="">Seleziona articolo...</option>
                        {articoli.map(a => (
                          <option key={a.id} value={a.id}>
                            {(a.codice ?? a.id) + (a.descrizione ? ` - ${a.descrizione}` : '')}
                          </option>
                        ))}
                      </select>
                      {label && (
                        <div className="mt-1 text-xs text-neutral-500">
                          Magazzino: {a?.magazzino ?? 0} · Impegnate: {a?.impegnate ?? 0}
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-2">
                      <input
                        type="number"
                        min={1}
                        className="w-full rounded-xl border border-neutral-200 p-3"
                        value={r.scatole}
                        onChange={(e) => setRiga(i, { scatole: Math.max(1, Number(e.target.value || 1)) })}
                        disabled={saving}
                      />
                    </div>

                    <div className="md:col-span-2 flex md:justify-end">
                      <button
                        type="button"
                        onClick={() => removeRiga(i)}
                        className="w-full md:w-auto rounded-xl border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-40"
                        disabled={saving || righe.length === 1}
                      >
                        Rimuovi
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <button
                type="button"
                onClick={loadAll}
                className="rounded-xl border border-neutral-200 px-4 py-2 text-sm hover:bg-neutral-50"
                disabled={saving}
              >
                Aggiorna dati
              </button>

              <button
                type="button"
                onClick={confermaOrdine}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                disabled={saving || loading}
              >
                {saving ? 'Salvataggio...' : 'Conferma ordine → Impegnate'}
              </button>
            </div>
          </div>
        </div>

        {loading && (
          <div className="mt-4 text-sm text-neutral-500">Caricamento dati...</div>
        )}
      </div>
    </main>
  );
}