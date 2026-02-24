'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Row = {
  id: string;
  stato: string | null;
  created_at: string | null;
  completed_at: string | null;
  cliente?: { id: string; nome: string } | null;
};

export default function CompletatePage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const { data, error } = await supabase
        .from('ordini')
        .select(`
          id, stato, created_at, completed_at,
          clienti:cliente_id ( id, nome )
        `)
        .eq('stato', 'COMPLETATO')
        .order('completed_at', { ascending: false });

      if (error) throw error;

      const mapped: Row[] = (data ?? []).map((o: any) => ({
        id: o.id,
        stato: o.stato,
        created_at: o.created_at,
        completed_at: o.completed_at,
        cliente: o.clienti ?? null,
      }));

      setRows(mapped);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Completate</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Storico ordini completati.
        </p>
      </header>

      {err && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-neutral-600">Totale: <b>{rows.length}</b></div>
        <button
          className="rounded-xl border border-neutral-200 px-4 py-2 text-sm hover:bg-neutral-50"
          onClick={load}
          disabled={loading}
        >
          Aggiorna
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-neutral-500">Caricamento...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
          Nessun ordine completato (per ora).
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="font-semibold">
                {r.cliente?.nome ?? 'Cliente sconosciuto'}{' '}
                <span className="text-neutral-400 font-normal">·</span>{' '}
                <span className="text-sm text-neutral-500">Ordine {r.id.slice(0, 8)}</span>
              </div>
              <div className="text-xs text-neutral-500 mt-1">
                Creato: {r.created_at ? new Date(r.created_at).toLocaleString() : '—'} ·
                Completato: {r.completed_at ? new Date(r.completed_at).toLocaleString() : '—'}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}