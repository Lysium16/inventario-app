'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabaseClient';

type ClienteRow = { id: string; nome: string; attivo: boolean };

export default function ClientiPage() {
  const sb = useMemo(() => getSupabase(), []);
  const [err, setErr] = useState('');
  const [nome, setNome] = useState('');
  const [rows, setRows] = useState<ClienteRow[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  async function load() {
    setErr('');
    const q = await sb.from('clienti').select('id,nome,attivo').order('nome', { ascending: true });
    if (q.error) return setErr(q.error.message);
    setRows((q.data as any[]) || []);
  }

  async function add() {
    setErr('');
    const n = nome.trim();
    if (!n) return;
    const ins = await sb.from('clienti').insert({ nome: n, attivo: true });
    if (ins.error) return setErr(ins.error.message);
    setNome('');
    await load();
  }

  async function countOrdini(clienteId: string) {
    const q = await sb
      .from('ordini')
      .select('id', { count: 'exact', head: true })
      .eq('cliente_id', clienteId);

    if (q.error) throw new Error(q.error.message);
    return q.count ?? 0;
  }

  async function toggleAttivo(c: ClienteRow) {
    setErr('');
    setBusy(b => ({ ...b, [c.id]: true }));
    try {
      const up = await sb.from('clienti').update({ attivo: !c.attivo }).eq('id', c.id);
      if (up.error) return setErr(up.error.message);
      await load();
    } finally {
      setBusy(b => ({ ...b, [c.id]: false }));
    }
  }

  async function del(c: ClienteRow) {
    setErr('');
    setBusy(b => ({ ...b, [c.id]: true }));
    try {
      const n = await countOrdini(c.id);
      if (n > 0) {
        setErr(`Non posso eliminare "${c.nome}": esistono ${n} ordini collegati. Usa "Disattiva".`);
        return;
      }
      if (!confirm(`Eliminare definitivamente "${c.nome}"?`)) return;

      const d = await sb.from('clienti').delete().eq('id', c.id);
      if (d.error) return setErr(d.error.message);
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Errore durante eliminazione');
    } finally {
      setBusy(b => ({ ...b, [c.id]: false }));
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-extrabold">Clienti</h1>
      <p className="mt-1 text-slate-600">Disattiva un cliente per rimuoverlo dall’uso senza perdere lo storico.</p>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{err}</div>}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            className="flex-1 rounded-xl border border-slate-200 px-4 py-3"
            placeholder="Nome cliente"
            value={nome}
            onChange={e => setNome(e.target.value)}
          />
          <button
            onClick={add}
            className="rounded-xl bg-teal-600 px-6 py-3 text-sm font-extrabold text-white hover:bg-teal-700"
          >
            Aggiungi
          </button>
          <button
            onClick={load}
            className="rounded-xl border border-slate-200 px-6 py-3 text-sm font-bold hover:border-slate-300"
          >
            Aggiorna
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <div className="p-5 text-slate-600">Nessun cliente.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map(c => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="truncate font-extrabold">{c.nome}</div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${c.attivo ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}>
                      {c.attivo ? 'attivo' : 'disattivo'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{c.id}</div>
                </div>

                <button
                  disabled={!!busy[c.id]}
                  onClick={() => toggleAttivo(c)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-extrabold hover:border-slate-300 disabled:opacity-50"
                >
                  {c.attivo ? 'Disattiva' : 'Attiva'}
                </button>

                <button
                  disabled={!!busy[c.id]}
                  onClick={() => del(c)}
                  className="rounded-xl border border-red-200 px-4 py-2 text-sm font-extrabold text-red-700 hover:border-red-300 disabled:opacity-50"
                >
                  Elimina
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}