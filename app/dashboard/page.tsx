'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabaseClient';

export default function DashboardPage() {
  const sb = useMemo(() => getSupabase(), []);
  const [err, setErr] = useState('');
  const [righe, setRighe] = useState<any[]>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});

  async function load() {
    setErr('');
    const q = await sb
      .from('ordini_righe')
      .select('id,ordine_id,articolo_id,scatole,stato,created_at, clienti:clienti(id,nome), articoli:articoli(id,cod_articolo,descrizione)')
      .eq('stato', 'IMPEGNATO')
      .order('created_at', { ascending: false });

    if (q.error) return setErr(q.error.message);
    setRighe((q.data as any[]) || []);
    setSel({});
  }

  async function completaSelezionate() {
    setErr('');
    const ids = Object.keys(sel).filter(k => sel[k]);
    if (ids.length === 0) return;

    // 1) segna righe completate
    const up = await sb.from('ordini_righe').update({ stato: 'COMPLETATO', completed_at: new Date().toISOString() }).in('id', ids);
    if (up.error) return setErr(up.error.message);

    // 2) se per un ordine non restano righe non completate, completa anche l’ordine
    const ordIds = Array.from(new Set(righe.filter(r => ids.includes(r.id)).map(r => r.ordine_id)));
    for (const oid of ordIds) {
      const left = await sb.from('ordini_righe').select('id').eq('ordine_id', oid).neq('stato', 'COMPLETATO').limit(1);
      if (left.error) return setErr(left.error.message);
      if (!left.data || left.data.length === 0) {
        const upo = await sb.from('ordini').update({ stato: 'COMPLETATO', completed_at: new Date().toISOString() }).eq('id', oid);
        if (upo.error) return setErr(upo.error.message);
      }
    }

    await load();
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-extrabold">Dashboard</h1>
      <p className="text-slate-600 mt-1">Qui vedi gli ordini in <b>Impegnate</b> e li puoi completare.</p>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{err}</div>}

      <div className="mt-6 flex items-center gap-3">
        <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:border-slate-300" onClick={load}>
          Aggiorna
        </button>
        <button className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-teal-700" onClick={completaSelezionate}>
          Segna completate (selezionate)
        </button>
        <div className="ml-auto text-sm text-slate-600">Righe in lavorazione: {righe.length}</div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        {righe.length === 0 ? (
          <div className="p-6 text-slate-600">Nessun ordine in lavorazione.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="p-3 text-left w-12"></th>
                  <th className="p-3 text-left">Cliente</th>
                  <th className="p-3 text-left">Articolo</th>
                  <th className="p-3 text-right">Scatole</th>
                  <th className="p-3 text-left">Stato</th>
                </tr>
              </thead>
              <tbody>
                {righe.map(r => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={!!sel[r.id]}
                        onChange={(e) => setSel(s => ({ ...s, [r.id]: e.target.checked }))}
                      />
                    </td>
                    <td className="p-3">{r.clienti ? r.clienti.nome : '—'}</td>
                    <td className="p-3">{r.articoli ? (r.articoli.cod_articolo + ' - ' + r.articoli.descrizione) : '—'}</td>
                    <td className="p-3 text-right font-bold">{r.scatole}</td>
                    <td className="p-3">{r.stato}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}