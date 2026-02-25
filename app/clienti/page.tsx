'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabaseClient';

type Cliente = { id: string; nome: string };

export default function ClientiPage() {
  const sb = useMemo(() => getSupabase(), []);
  const [err, setErr] = useState('');
  const [nome, setNome] = useState('');
  const [rows, setRows] = useState<Cliente[]>([]);

  async function load() {
    setErr('');
    const q = await sb.from('clienti').select('id,nome').order('nome', { ascending: true });
    if (q.error) return setErr(q.error.message);
    setRows((q.data as any[]) || []);
  }

  async function add() {
    setErr('');
    const n = nome.trim();
    if (!n) return setErr('Inserisci un nome cliente.');
    const ins = await sb.from('clienti').insert({ nome: n }).select('id,nome').single();
    if (ins.error) return setErr(ins.error.message);
    setNome('');
    await load();
  }

  async function del(id: string, label: string) {
    setErr('');
    if (!confirm(`Eliminare il cliente "${label}"?`)) return;
    const d = await sb.from('clienti').delete().eq('id', id);
    if (d.error) return setErr(d.error.message);
    await load();
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-extrabold">Clienti</h1>
      <p className="text-slate-600 mt-1">Anagrafiche usate per ordini, impegni e storico.</p>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{err}</div>}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div>
            <label className="text-sm font-semibold text-slate-700">Nome cliente</label>
            <input
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-300"
              placeholder="Es. Rossi SRL"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button className="w-full rounded-xl bg-teal-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-teal-700" onClick={add}>
              Aggiungi
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div className="font-extrabold">Elenco</div>
          <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:border-slate-300" onClick={load}>
            Aggiorna
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="p-6 text-slate-600">Nessun cliente salvato.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map(c => (
              <li key={c.id} className="p-5 flex items-center gap-4">
                <div className="min-w-0">
                  <div className="font-bold">{c.nome}</div>
                  <div className="text-xs text-slate-400">{c.id}</div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 border border-slate-200">attivo</span>
                  <button
                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 hover:border-red-300"
                    onClick={() => del(c.id, c.nome)}
                  >
                    Elimina
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}