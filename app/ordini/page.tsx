'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabaseClient';

type Cliente = { id: string; nome: string };
type Articolo = { id: string; cod_articolo: string; descrizione: string; visibile_magazzino: boolean };

type RigaDraft = { articolo_id: string; scatole: number };

export default function OrdiniClientiPage() {
  const sb = useMemo(() => getSupabase(), []);
  const [err, setErr] = useState('');

  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [articoli, setArticoli] = useState<Articolo[]>([]);

  const [qCli, setQCli] = useState('');
  const [qArt, setQArt] = useState('');

  const [clienteId, setClienteId] = useState('');
  const [righe, setRighe] = useState<RigaDraft[]>([{ articolo_id: '', scatole: 1 }]);

  async function load() {
    setErr('');
    const c = await sb.from('clienti').select('id,nome').order('nome', { ascending: true });
    if (c.error) return setErr(c.error.message);
    setClienti((c.data as any[]) || []);

    const a = await sb
      .from('articoli')
      .select('id,cod_articolo,descrizione,visibile_magazzino')
      .eq('visibile_magazzino', true)
      .order('cod_articolo', { ascending: true });
    if (a.error) return setErr(a.error.message);
    setArticoli((a.data as any[]) || []);
  }

  function addRiga() {
    setRighe(r => [...r, { articolo_id: '', scatole: 1 }]);
  }

  function removeRiga(i: number) {
    setRighe(r => r.length <= 1 ? r : r.filter((_, idx) => idx !== i));
  }

  async function conferma() {
    setErr('');
    if (!clienteId) return setErr('Seleziona un cliente.');
    const clean = righe
      .map(r => ({ articolo_id: r.articolo_id, scatole: Number(r.scatole || 0) }))
      .filter(r => r.articolo_id && r.scatole > 0);

    if (clean.length === 0) return setErr('Aggiungi almeno una riga valida.');

    const o = await sb.from('ordini').insert({ cliente_id: clienteId, stato: 'CREATO' }).select('id').single();
    if (o.error) return setErr(o.error.message);
    const ordineId = (o.data as any).id as string;

    const ins = await sb.from('ordini_righe').insert(
      clean.map(r => ({ ordine_id: ordineId, articolo_id: r.articolo_id, scatole: r.scatole, stato: 'CREATO' }))
    );
    if (ins.error) return setErr(ins.error.message);

    // Per ora: stato righe direttamente in IMPEGNATO (così Dashboard le vede).
    const up = await sb.from('ordini_righe').update({ stato: 'IMPEGNATO' }).eq('ordine_id', ordineId);
    if (up.error) return setErr(up.error.message);

    setRighe([{ articolo_id: '', scatole: 1 }]);
    alert('Ordine creato e messo in Impegnate (righe IMPEGNATO).');
  }

  useEffect(() => { load(); }, []);

  const clientiFiltrati = clienti.filter(c =>
    (c.nome || '').toLowerCase().includes(qCli.toLowerCase()) || (c.id || '').includes(qCli)
  );

  const articoliFiltrati = articoli.filter(a => {
    const s = (a.cod_articolo + ' ' + a.descrizione).toLowerCase();
    return s.includes(qArt.toLowerCase());
  });

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-extrabold">Ordini clienti</h1>
      <p className="text-slate-600 mt-1">Quando confermi, l’ordine va direttamente nelle <b>Impegnate</b>.</p>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{err}</div>}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-700">Cerca cliente</label>
            <input
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-300"
              placeholder="Scrivi per filtrare (nome o id)"
              value={qCli}
              onChange={(e) => setQCli(e.target.value)}
            />
            <label className="mt-4 block text-sm font-semibold text-slate-700">Cliente</label>
            <select
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-300"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
            >
              <option value="">Seleziona cliente…</option>
              {clientiFiltrati.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">Cerca articolo</label>
            <input
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-300"
              placeholder="Scrivi per filtrare (codice o descrizione)"
              value={qArt}
              onChange={(e) => setQArt(e.target.value)}
            />
            <div className="mt-2 text-sm text-slate-500">{articoliFiltrati.length} articoli visibili</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <div className="font-extrabold">Righe ordine</div>
            <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:border-slate-300" onClick={addRiga}>
              + Aggiungi riga
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {righe.map((r, i) => (
              <div key={i} className="grid gap-3 md:grid-cols-[1fr_140px_auto] items-center">
                <select
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-300"
                  value={r.articolo_id}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRighe(all => all.map((x, idx) => idx === i ? { ...x, articolo_id: v } : x));
                  }}
                >
                  <option value="">Seleziona articolo…</option>
                  {articoliFiltrati.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.cod_articolo} - {a.descrizione}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  min={1}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-300"
                  value={r.scatole}
                  onChange={(e) => {
                    const v = Number(e.target.value || 1);
                    setRighe(all => all.map((x, idx) => idx === i ? { ...x, scatole: v } : x));
                  }}
                />

                <button
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:border-slate-300 disabled:opacity-50"
                  onClick={() => removeRiga(i)}
                  disabled={righe.length <= 1}
                >
                  Rimuovi
                </button>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              className="rounded-xl bg-teal-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-teal-700"
              onClick={conferma}
            >
              Conferma ordine → Impegnate
            </button>
          </div>

          <div className="mt-4 text-xs text-slate-500">
            Nota: in questa patch mettiamo le righe direttamente in <b>IMPEGNATO</b> per farle comparire in Dashboard.
            Il passo successivo è scalare/aggiornare anche le quantità su articoli in modo atomico via RPC/trigger.
          </div>
        </div>
      </div>
    </main>
  );
}