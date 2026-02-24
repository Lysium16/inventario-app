export const dynamic = 'force-dynamic';
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
type ArticoloAny = {
  id: string;
  codice?: string | null;
  misura?: string | null;
  nome?: string | null;
  descrizione?: string | null;
};

type Cliente = {
  id: string;
  nome: string;
};

type RigaOrdine = {
  articoloId: string;
  scatole: number;
};

function labelArticolo(a: ArticoloAny) {
  const code = (a.codice ?? a.misura ?? '').trim();
  const name = (a.nome ?? a.descrizione ?? '').trim();
  if (code && name) return `${code} - ${name}`;
  return code || name || a.id;
}

function sortKeyArticolo(a: ArticoloAny) {
  return ((a.codice ?? a.misura ?? a.nome ?? a.descrizione ?? a.id) ?? '').toString().toLowerCase();
}

export default function OrdiniPage() {
  const [clienteId, setClienteId] = useState('');
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [articoli, setArticoli] = useState<ArticoloAny[]>([]);
  const [righe, setRighe] = useState<RigaOrdine[]>([{ articoloId: '', scatole: 1 }]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMsg(null);

      // ARTICOLI: non chiediamo colonne che magari non esistono.
      // Prendiamo * e poi ordiniamo lato client con il campo migliore disponibile.
      const { data: da, error: ea } = await supabase
        .from('articoli')
        .select('*');

      if (cancelled) return;
      if (ea) {
        setMsg('Errore caricamento articoli: ' + ea.message);
      } else {
        const arr = ((da as any[]) ?? []) as ArticoloAny[];
        arr.sort((x, y) => sortKeyArticolo(x).localeCompare(sortKeyArticolo(y)));
        setArticoli(arr);
      }

      const { data: dc, error: ec } = await supabase
        .from('clienti')
        .select('id,nome')
        .order('nome', { ascending: true });

      if (cancelled) return;
      if (ec) {
        setMsg((prev) => (prev ? prev + ' | ' : '') + 'Errore caricamento clienti: ' + ec.message);
      } else {
        setClienti(((dc as any[]) ?? []) as Cliente[]);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const canSubmit = useMemo(() => {
    if (!clienteId) return false;
    if (!righe.length) return false;
    return righe.every(r => r.articoloId && r.scatole > 0);
  }, [clienteId, righe]);

  function updateRiga(i: number, patch: Partial<RigaOrdine>) {
    setRighe(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }

  function addRiga() {
    setRighe(prev => [...prev, { articoloId: '', scatole: 1 }]);
  }

  function removeRiga(i: number) {
    setRighe(prev => prev.filter((_, idx) => idx !== i));
  }

  async function confermaOrdine() {
    setMsg(null);
    setLoading(true);
    try {
      // 1) testata ordine
      const { data: ordine, error: e1 } = await supabase
        .from('ordini')
        .insert({ cliente_id: clienteId, stato: 'INVIATO' })
        .select('id')
        .single();

      if (e1) throw e1;
      const ordineId = (ordine as any).id as string;

      // 2) righe
      const payload = righe.map(r => ({
        ordine_id: ordineId,
        articolo_id: r.articoloId,
        scatole: r.scatole
      }));

      const { error: e2 } = await supabase.from('ordini_righe').insert(payload);
      if (e2) throw e2;

      setMsg('Ordine creato (' + ordineId + ').');
      setClienteId('');
      setRighe([{ articoloId: '', scatole: 1 }]);
    } catch (err: any) {
      setMsg('Errore conferma ordine: ' + (err?.message ?? String(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Ordini</h1>
        <a href="/" className="text-sm underline opacity-80 hover:opacity-100">Torna al magazzino</a>
      </div>

      <p className="mt-2 opacity-70">
        Collega clienti + articoli. Nessuna magia: solo DB (e i tuoi dati che devono esistere davvero).
      </p>

      <div className="mt-5 grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Cliente</span>
          <select
            value={clienteId}
            onChange={e => setClienteId(e.target.value)}
            className="h-11 rounded-xl border border-neutral-200 bg-white/60 px-3 dark:bg-black/20"
          >
            <option value="">Seleziona cliente...</option>
            {clienti.map(cl => (
              <option key={cl.id} value={cl.id}>{cl.nome}</option>
            ))}
          </select>
        </label>

        <div className="rounded-2xl border border-neutral-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-base font-semibold">Righe ordine</h2>
            <button
              onClick={addRiga}
              className="rounded-xl border border-neutral-200 px-3 py-2 text-sm"
              type="button"
            >
              + Aggiungi riga
            </button>
          </div>

          <div className="mt-3 grid gap-3">
            {righe.map((r, i) => (
              <div key={i} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_160px_120px] md:items-center">
                <select
                  value={r.articoloId}
                  onChange={e => updateRiga(i, { articoloId: e.target.value })}
                  className="h-11 rounded-xl border border-neutral-200 bg-white/60 px-3 dark:bg-black/20"
                >
                  <option value="">Seleziona articolo...</option>
                  {articoli.map(a => (
                    <option key={a.id} value={a.id}>
                      {labelArticolo(a)}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  min={1}
                  value={r.scatole}
                  onChange={e => updateRiga(i, { scatole: Number(e.target.value) })}
                  className="h-11 rounded-xl border border-neutral-200 bg-white/60 px-3 dark:bg-black/20"
                />

                <button
                  onClick={() => removeRiga(i)}
                  disabled={righe.length === 1}
                  className="rounded-xl border border-neutral-200 px-3 py-2 text-sm disabled:opacity-40"
                  type="button"
                >
                  Rimuovi
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={confermaOrdine}
            disabled={!canSubmit || loading}
            className="rounded-xl border border-neutral-200 px-4 py-2 text-sm disabled:opacity-50"
            type="button"
          >
            {loading ? 'Invio...' : 'Conferma ordine'}
          </button>

          {msg && <span className="text-sm opacity-80">{msg}</span>}
        </div>

        <p className="text-sm opacity-60">
          Se â€œnon vedi differenzeâ€, spesso Ã¨ perchÃ© il DB ti sta rispondendo â€œnoâ€ (RLS) o perchÃ© mancano dati.
        </p>
      </div>
    </main>
  );
}
