'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabaseClient';

export default function ClientiPage() {
  const sb = useMemo(() => getSupabase(), []);
  const [err, setErr] = useState('');
  const [nome, setNome] = useState('');
  const [rows, setRows] = useState<any[]>([]);

  async function load() {
    setErr('');
    const q = await sb.from('clienti').select('id,nome').order('nome');
    if (q.error) return setErr(q.error.message);
    setRows(q.data || []);
  }

  async function add() {
    if (!nome.trim()) return;
    const ins = await sb.from('clienti').insert({ nome: nome.trim() });
    if (ins.error) return setErr(ins.error.message);
    setNome('');
    await load();
  }

  async function del(id: string) {
    if (!confirm('Eliminare cliente?')) return;
    const d = await sb.from('clienti').delete().eq('id', id);
    if (d.error) return setErr(d.error.message);
    await load();
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-extrabold">Clienti</h1>

      {err && <div className="mt-4 p-4 border border-red-200 bg-red-50 text-red-700 rounded-xl">{err}</div>}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex gap-3">
          <input
            className="flex-1 rounded-xl border border-slate-200 px-4 py-3"
            placeholder="Nome cliente"
            value={nome}
            onChange={e => setNome(e.target.value)}
          />
          <button
            onClick={add}
            className="rounded-xl bg-teal-600 px-5 py-3 text-white font-bold"
          >
            Aggiungi
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white">
        {rows.length === 0 ? (
          <div className="p-5 text-slate-600">Nessun cliente.</div>
        ) : (
          <ul>
            {rows.map(r => (
              <li key={r.id} className="flex justify-between items-center p-4 border-b border-slate-100">
                <div>
                  <div className="font-bold">{r.nome}</div>
                  <div className="text-xs text-slate-500">{r.id}</div>
                </div>
                <button
                  onClick={() => del(r.id)}
                  className="text-red-600 font-bold"
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