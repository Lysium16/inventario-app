'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabaseClient';

export default function CompletatePage() {
  const sb = useMemo(() => getSupabase(), []);
  const [err, setErr] = useState('');
  const [righe, setRighe] = useState<any[]>([]);

  async function load() {
    setErr('');
    const q = await sb
      .from('ordini_righe')
      .select('id,ordine_id,scatole,completed_at, clienti:clienti(id,nome), articoli:articoli(id,cod_articolo,descrizione)')
      .eq('stato', 'COMPLETATO')
      .order('completed_at', { ascending: false });

    if (q.error) return setErr(q.error.message);
    setRighe((q.data as any[]) || []);
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-extrabold">Completate</h1>
      <p className="text-slate-600 mt-1">Storico righe completate.</p>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{err}</div>}

      <div className="mt-6 flex items-center gap-3">
        <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:border-slate-300" onClick={load}>
          Aggiorna
        </button>
        <div className="ml-auto text-sm text-slate-600">Righe: {righe.length}</div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        {righe.length === 0 ? (
          <div className="p-6 text-slate-600">Nessuna riga completata ancora.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="p-3 text-left">Data</th>
                <th className="p-3 text-left">Cliente</th>
                <th className="p-3 text-left">Articolo</th>
                <th className="p-3 text-right">Scatole</th>
              </tr>
            </thead>
            <tbody>
              {righe.map(r => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="p-3">{r.completed_at ? new Date(r.completed_at).toLocaleString() : '—'}</td>
                  <td className="p-3">{r.clienti ? r.clienti.nome : '—'}</td>
                  <td className="p-3">{r.articoli ? (r.articoli.cod_articolo + ' - ' + r.articoli.descrizione) : '—'}</td>
                  <td className="p-3 text-right font-bold">{r.scatole}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}