'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Cliente = { id: string; nome: string };
type Articolo = { id: string; codice?: string | null; descrizione?: string | null };

type Riga = {
  id: string;
  ordine_id: string;
  articolo_id: string;
  scatole: number;
  stato: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  articolo?: Articolo | null;
};

type Ordine = {
  id: string;
  stato: string | null;
  created_at: string | null;
  completed_at?: string | null;
  cliente_id: string | null;
  cliente?: Cliente | null;
  righe?: Riga[];
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [ordini, setOrdini] = useState<Ordine[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({}); // riga_id -> checked

  const pendingCount = useMemo(() => {
    let n = 0;
    ordini.forEach(o => (o.righe ?? []).forEach(r => { if (r.stato !== 'COMPLETATO') n++; }));
    return n;
  }, [ordini]);

  async function load() {
    setLoading(true);
    setErr(null);
    setOk(null);
    try {
      // Nota: per le relazioni PostgREST, usiamo le FK cliente_id e ordine_id.
      const { data, error } = await supabase
        .from('ordini')
        .select(`
          id, stato, created_at, completed_at, cliente_id,
          clienti:cliente_id ( id, nome ),
          ordini_righe:ordini_righe ( id, ordine_id, articolo_id, scatole, stato, created_at, completed_at,
            articoli:articolo_id ( id, codice, descrizione )
          )
        `)
        .neq('stato', 'COMPLETATO')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped: Ordine[] = (data ?? []).map((o: any) => ({
        id: o.id,
        stato: o.stato,
        created_at: o.created_at,
        completed_at: o.completed_at,
        cliente_id: o.cliente_id,
        cliente: o.clienti ?? null,
        righe: (o.ordini_righe ?? []).map((r: any) => ({
          id: r.id,
          ordine_id: r.ordine_id,
          articolo_id: r.articolo_id,
          scatole: r.scatole,
          stato: r.stato,
          created_at: r.created_at,
          completed_at: r.completed_at,
          articolo: r.articoli ?? null,
        })),
      }));

      setOrdini(mapped);

      // default: seleziona tutte le righe non completate
      const sel: Record<string, boolean> = {};
      mapped.forEach(o => (o.righe ?? []).forEach(r => {
        if (r.stato !== 'COMPLETATO') sel[r.id] = true;
      }));
      setSelected(sel);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function toggle(rigaId: string) {
    setSelected(prev => ({ ...prev, [rigaId]: !prev[rigaId] }));
  }

  async function decStockAndImpegni(articoloId: string, scatole: number) {
    // select current
    const { data, error } = await supabase
      .from('articoli')
      .select('id,magazzino,impegnate')
      .eq('id', articoloId)
      .single();
    if (error) throw error;

    const mag = (data?.magazzino ?? 0) as number;
    const imp = (data?.impegnate ?? 0) as number;

    const nextMag = Math.max(0, mag - scatole);
    const nextImp = Math.max(0, imp - scatole);

    const { error: uErr } = await supabase
      .from('articoli')
      .update({ magazzino: nextMag, impegnate: nextImp })
      .eq('id', articoloId);
    if (uErr) throw uErr;
  }

  async function completaSelezionate() {
    setErr(null);
    setOk(null);

    const righeToComplete: Riga[] = [];
    ordini.forEach(o => (o.righe ?? []).forEach(r => {
      if (r.stato !== 'COMPLETATO' && selected[r.id]) righeToComplete.push(r);
    }));

    if (righeToComplete.length === 0) {
      setErr('Seleziona almeno una riga da completare.');
      return;
    }

    setBusy(true);
    try {
      // 1) scala stock + impegnate per ogni riga selezionata
      for (const r of righeToComplete) {
        await decStockAndImpegni(r.articolo_id, r.scatole);
      }

      // 2) marca righe completate
      const ids = righeToComplete.map(r => r.id);
      const { error: rErr } = await supabase
        .from('ordini_righe')
        .update({ stato: 'COMPLETATO', completed_at: new Date().toISOString() })
        .in('id', ids);
      if (rErr) throw rErr;

      // 3) per ogni ordine coinvolto: se non restano righe non completate -> marca ordine completato
      const orderIds = Array.from(new Set(righeToComplete.map(r => r.ordine_id)));
      for (const oid of orderIds) {
        const { data: remaining, error: remErr } = await supabase
          .from('ordini_righe')
          .select('id')
          .eq('ordine_id', oid)
          .neq('stato', 'COMPLETATO');
        if (remErr) throw remErr;

        if ((remaining ?? []).length === 0) {
          const { error: oErr } = await supabase
            .from('ordini')
            .update({ stato: 'COMPLETATO', completed_at: new Date().toISOString() })
            .eq('id', oid);
          if (oErr) throw oErr;
        }
      }

      setOk(`Completate ${ids.length} righe. Stock aggiornato.`);
      await load();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Qui vedi gli ordini in <b>Impegnate</b> e li puoi completare (scalando il magazzino).
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

      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-neutral-600">
          Righe in lavorazione: <b>{pendingCount}</b>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-xl border border-neutral-200 px-4 py-2 text-sm hover:bg-neutral-50"
            onClick={load}
            disabled={busy}
          >
            Aggiorna
          </button>
          <button
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            onClick={completaSelezionate}
            disabled={busy || loading}
          >
            {busy ? 'Completamento...' : 'Segna completate (selezionate)'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-neutral-500">Caricamento...</div>
      ) : ordini.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
          Nessun ordine in lavorazione. Che mondo strano.
        </div>
      ) : (
        <div className="space-y-4">
          {ordini.map(o => (
            <div key={o.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <div className="font-semibold">
                    {o.cliente?.nome ?? 'Cliente sconosciuto'} <span className="text-neutral-400 font-normal">·</span>{' '}
                    <span className="text-sm text-neutral-500">Ordine {o.id.slice(0, 8)}</span>
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    Stato: <b>{o.stato ?? '—'}</b> · Creato: {o.created_at ? new Date(o.created_at).toLocaleString() : '—'}
                  </div>
                </div>
              </div>

              <div className="mt-4 divide-y">
                {(o.righe ?? []).map(r => {
                  const label = r.articolo?.codice ?? r.articolo_id;
                  const desc = r.articolo?.descrizione ? ` - ${r.articolo.descrizione}` : '';
                  const isDone = r.stato === 'COMPLETATO';
                  return (
                    <label key={r.id} className="flex items-center gap-3 py-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!selected[r.id]}
                        onChange={() => toggle(r.id)}
                        disabled={busy || isDone}
                      />
                      <div className="flex-1">
                        <div className="text-sm">
                          <b>{label}</b>{desc} · scatole: <b>{r.scatole}</b>
                        </div>
                        <div className="text-xs text-neutral-500">
                          Stato riga: <b>{r.stato ?? '—'}</b>
                        </div>
                      </div>
                      {isDone && (
                        <span className="text-xs rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1">
                          completato
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}