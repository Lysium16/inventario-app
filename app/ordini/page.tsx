'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabaseClient';

type Riga = { articolo_id: string; scatole: number };

export default function OrdiniClientiPage() {
  const sb = useMemo(() => getSupabase(), []);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const [clienti, setClienti] = useState<any[]>([]);
  const [articoli, setArticoli] = useState<any[]>([]);

  const [qCli, setQCli] = useState('');
  const [qArt, setQArt] = useState('');

  const [clienteId, setClienteId] = useState('');
  const [righe, setRighe] = useState<Riga[]>([{ articolo_id: '', scatole: 1 }]);

  const clientiVis = useMemo(() => {
    const q = qCli.trim().toLowerCase();
    if (!q) return clienti;
    return clienti.filter(c =>
      (c.nome || '').toLowerCase().includes(q) ||
      (c.id || '').toLowerCase().includes(q)
    );
  }, [clienti, qCli]);

  const articoliVis = useMemo(() => {
    const q = qArt.trim().toLowerCase();
    const base = articoli;
    if (!q) return base;
    return base.filter(a =>
      (a.cod_articolo || '').toLowerCase().includes(q) ||
      (a.descrizione || '').toLowerCase().includes(q)
    );
  }, [articoli, qArt]);

  async function load() {
    setErr(''); setOk('');

    // clienti: SOLO id,nome (niente created_at inventati)
    const qc = await sb.from('clienti').select('id,nome').order('nome', { ascending: true });
    if (qc.error) return setErr(qc.error.message);
    setClienti(qc.data || []);

    // articoli visibili: id,cod_articolo,descrizione
    const qa = await sb
      .from('articoli')
      .select('id,cod_articolo,descrizione,visibile_magazzino')
      .eq('visibile_magazzino', true)
      .order('cod_articolo', { ascending: true });

    if (qa.error) return setErr(qa.error.message);
    setArticoli(qa.data || []);
  }

  function addRiga() {
    setRighe(r => [...r, { articolo_id: '', scatole: 1 }]);
  }

  function rmRiga(i: number) {
    setRighe(r => (r.length <= 1 ? r : r.filter((_, idx) => idx !== i)));
  }

  async function conferma() {
    setErr(''); setOk('');

    if (!clienteId) return setErr('Seleziona un cliente.');

    const clean = righe
      .map(r => ({ articolo_id: r.articolo_id, scatole: Number(r.scatole || 0) }))
      .filter(r => !!r.articolo_id && r.scatole > 0);

    if (clean.length === 0) return setErr('Aggiungi almeno una riga valida.');

    // 1) crea ordine
    const o = await sb.from('ordini').insert({ cliente_id: clienteId, stato: 'CREATO' }).select('id').single();
    if (o.error) return setErr(o.error.message);
    const ordineId = o.data.id as string;

    // 2) crea righe già IMPEGNATO
    const ins = await sb.from('ordini_righe').insert(
      clean.map(r => ({
        ordine_id: ordineId,
        articolo_id: r.articolo_id,
        scatole: r.scatole,
        stato: 'IMPEGNATO'
      }))
    );
    if (ins.error) return setErr(ins.error.message);

    // 3) incrementa stock impegnate (senza RPC)
    for (const r of clean) {
      const cur = await sb.from('articoli').select('id,impegnate,scatole_impegnate').eq('id', r.articolo_id).single();
      if (cur.error) return setErr(cur.error.message);

      const nextImpegnate = (Number(cur.data?.impegnate || 0) + r.scatole);
      const nextScImp     = (Number(cur.data?.scatole_impegnate || 0) + r.scatole);

      const up = await sb.from('articoli')
        .update({ impegnate: nextImpegnate, scatole_impegnate: nextScImp })
        .eq('id', r.articolo_id);

      if (up.error) return setErr(up.error.message);
    }

    // reset form
    setClienteId('');
    setQCli('');
    setQArt('');
    setRighe([{ articolo_id: '', scatole: 1 }]);
    setOk('Ordine creato e messo in Impegnate.');
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-extrabold">Ordini clienti</h1>
      <p className="mt-1 text-slate-600">Quando confermi, l’ordine va direttamente nelle <b>Impegnate</b>.</p>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{err}</div>}
      {ok  && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">{ok}</div>}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-sm font-extrabold">Cerca cliente</div>
            <input className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"
              placeholder="Scrivi per filtrare (nome o id)"
              value={qCli} onChange={e => setQCli(e.target.value)} />
            <div className="mt-3 text-sm font-semibold text-slate-700">Cliente</div>
            <select className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"
              value={clienteId} onChange={e => setClienteId(e.target.value)}>
              <option value="">Seleziona cliente...</option>
              {clientiVis.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>

          <div>
            <div className="text-sm font-extrabold">Cerca articolo</div>
            <input className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"
              placeholder="Scrivi per filtrare (codice o descrizione)"
              value={qArt} onChange={e => setQArt(e.target.value)} />
            <div className="mt-2 text-xs text-slate-500">{articoliVis.length} articoli visibili</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <div className="text-sm font-extrabold">Righe ordine</div>
            <button onClick={addRiga} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:border-slate-300">
              + Aggiungi riga
            </button>
          </div>

          <div className="mt-3 space-y-3">
            {righe.map((r, i) => (
              <div key={i} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_140px_140px]">
                <select className="w-full rounded-xl border border-slate-200 px-4 py-3"
                  value={r.articolo_id}
                  onChange={e => {
                    const v = e.target.value;
                    setRighe(prev => prev.map((x, idx) => (idx === i ? { ...x, articolo_id: v } : x)));
                  }}>
                  <option value="">Seleziona articolo...</option>
                  {articoliVis.map(a => (
                    <option key={a.id} value={a.id}>{a.cod_articolo} - {a.descrizione}</option>
                  ))}
                </select>

                <input type="number" min={1} className="w-full rounded-xl border border-slate-200 px-4 py-3"
                  value={r.scatole}
                  onChange={e => {
                    const v = Math.max(1, Number(e.target.value || 1));
                    setRighe(prev => prev.map((x, idx) => (idx === i ? { ...x, scatole: v } : x)));
                  }} />

                <button onClick={() => rmRiga(i)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:border-slate-300">
                  Rimuovi
                </button>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-end gap-3">
            <button onClick={load} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:border-slate-300">
              Aggiorna dati
            </button>
            <button onClick={conferma} className="rounded-xl bg-teal-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-teal-700">
              Conferma ordine → Impegnate
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}