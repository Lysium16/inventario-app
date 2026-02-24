'use client';

import { useEffect, useMemo, useState } from 'react';
import DomobagsHeader from '../../components/DomobagsHeader';
import { supabase } from '../../lib/supabaseClient';

type Cliente = { id: string; nome: string };

export const dynamic = 'force-dynamic';

export default function ClientiPage() {
  const [nome, setNome] = useState('');
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setMsg(null);
    const { data, error } = await supabase
      .from('clienti')
      .select('id, nome')
      .order('nome', { ascending: true });

    setLoading(false);

    if (error) {
      setMsg('Errore lettura clienti: ' + error.message);
      setClienti([]);
      return;
    }
    setClienti((data ?? []) as Cliente[]);
  }

  useEffect(() => { load(); }, []);

  const canAdd = useMemo(() => nome.trim().length >= 2, [nome]);

  async function addCliente() {
    const n = nome.trim();
    if (n.length < 2) return;

    setLoading(true);
    setMsg(null);

    const { error } = await supabase.from('clienti').insert({ nome: n });
    setLoading(false);

    if (error) {
      setMsg('Errore inserimento: ' + error.message);
      return;
    }

    setNome('');
    setMsg('Cliente aggiunto.');
    load();
  }

  return (
    <>
      <DomobagsHeader active="clienti" />
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-3xl font-semibold tracking-tight">Clienti</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Anagrafiche usate per ordini, impegni e storico. Roba semplice, ma deve funzionare.
        </p>

        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-sm font-medium text-neutral-700">Nome cliente</label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Es. Rossi SRL"
                className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:ring-2 focus:ring-teal-200"
              />
            </div>
            <button
              onClick={addCliente}
              disabled={!canAdd || loading}
              className={[
                'rounded-xl px-5 py-3 font-semibold transition',
                (!canAdd || loading) ? 'bg-neutral-100 text-neutral-400' : 'bg-teal-600 text-white hover:bg-teal-700'
              ].join(' ')}
            >
              Aggiungi
            </button>
          </div>

          {msg && (
            <div className="mt-4 rounded-xl bg-neutral-50 border border-neutral-200 px-4 py-3 text-sm text-neutral-700">
              {msg}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Elenco</h2>
            <button
              onClick={load}
              disabled={loading}
              className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-semibold hover:bg-neutral-50"
            >
              Aggiorna
            </button>
          </div>

          <div className="mt-4">
            {loading && <div className="text-sm text-neutral-500">Caricamento…</div>}
            {!loading && clienti.length === 0 && (
              <div className="text-sm text-neutral-500">Nessun cliente.</div>
            )}

            {!loading && clienti.length > 0 && (
              <ul className="divide-y divide-neutral-100">
                {clienti.map((c) => (
                  <li key={c.id} className="py-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="font-semibold text-neutral-900 truncate">{c.nome}</div>
                      <div className="text-xs text-neutral-500 truncate">{c.id}</div>
                    </div>
                    <span className="text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-100 px-3 py-1 rounded-full">
                      attivo
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </>
  );
}