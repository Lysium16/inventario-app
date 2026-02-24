'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Articolo = {
  id: string;
  codice?: string;
  nome?: string;
  descrizione?: string;
};

type Cliente = {
  id: string;
  nome: string;
};
type RigaOrdine = {
  articoloId: string;
  scatole: number;
};

export default function OrdiniPage() {
  const [clienteId, setClienteId] = useState('');
  const [clienti, setClienti] = useState<Cliente[]>([]);
const [articoli, setArticoli] = useState<Articolo[]>([]);
  const [righe, setRighe] = useState<RigaOrdine[]>([{ articoloId: '', scatole: 1 }]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('articoli')
        .select('id,codice,nome,descrizione')
        .order('codice', { ascending: true });

      if (cancelled) return;
      if (error) {
        setMsg('Errore caricamento articoli: ' + error.message);
        return;
      }
      setArticoli((data as any[]) ?? []);

      const { data: dc, error: ec } = await supabase
        .from('clienti')
        .select('id,nome')
        .order('nome', { ascending: true });

      if (cancelled) return;
      if (ec) {
        setMsg('Errore caricamento clienti: ' + ec.message);
        return;
      }
      setClienti((dc as any[]) ?? []);})();
    return () => { cancelled = true; };
  }, []);

  const canSubmit = useMemo(() => {
    if (!clienteId) return false;
    if (!righe.length) return false;
    return righe.every(r => r.articoloId && r.scatole > 0);
  }, [clienteId, righe]);

  function updateRiga(i: number, patch: Partial<RigaOrdine>) {
    setRighe(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }

  function addRiga() {
    setRighe(prev => [...prev, { articoloId: '', scatole: 1 }]);
  }

  function removeRiga(i: number) {
    setRighe(prev => prev.filter((_, idx) => idx !== i));
  }

  async function confermaOrdine() {
    setMsg(null);
    setLoading(true);
    try {
      // 1) crea testata ordine (tabella: ordini)
      const { data: ordine, error: e1 } = await supabase
        .from('ordini')
        .insert({ cliente_id: clienteId, stato: 'INVIATO' })
        .select('id')
        .single();

      if (e1) throw e1;
      const ordineId = (ordine as any).id;

      // 2) inserisce righe (tabella: ordini_righe)
      const payload = righe.map(r => ({
        ordine_id: ordineId,
        articolo_id: r.articoloId,
        scatole: r.scatole
      }));

      const { error: e2 } = await supabase.from('ordini_righe').insert(payload);
      if (e2) throw e2;

      setMsg('Ordine creato (' + ordineId + ').');
      setClienteId('');
      setRighe([{ articoloId: '', scatole: 1 }]);
    } catch (err: any) {
      setMsg('Errore conferma ordine: ' + (err?.message ?? String(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Ordini</h1>
      <p style={{ opacity: 0.7, marginTop: 6 }}>Collegato a clienti (nome) e articoli. Niente telepatia, solo DB.</p>

      <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Cliente</span>
<select
  value={clienteId}
  onChange={e => setClienteId(e.target.value)}
  style={{ padding: 10, borderRadius: 10, border: '1px solid #ddd' }}
>
  <option value="">Seleziona cliente...</option>
  {clienti.map((cl: any) => (
    <option key={cl.id} value={cl.id}>{cl.nome}</option>
  ))}
</select>
</label>

        <div style={{ border: '1px solid #eee', borderRadius: 14, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Righe ordine</h2>
            <button onClick={addRiga} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #ddd' }}>
              + Aggiungi riga
            </button>
          </div>

          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {righe.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 120px', gap: 10, alignItems: 'center' }}>
                <select
                  value={r.articoloId}
                  onChange={e => updateRiga(i, { articoloId: e.target.value })}
                  style={{ padding: 10, borderRadius: 10, border: '1px solid #ddd' }}
                >
                  <option value="">Seleziona articolo...</option>
                  {articoli.map((a: any) => (
                    <option key={a.id ?? a.codice} value={a.id ?? a.codice}>
                      {(a.codice ? a.codice + ' - ' : '') + (a.nome ?? a.descrizione ?? 'Senza nome')}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  min={1}
                  value={r.scatole}
                  onChange={e => updateRiga(i, { scatole: Number(e.target.value) })}
                  style={{ padding: 10, borderRadius: 10, border: '1px solid #ddd' }}
                />

                <button
                  onClick={() => removeRiga(i)}
                  disabled={righe.length === 1}
                  style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #ddd', opacity: righe.length === 1 ? 0.4 : 1 }}
                >
                  Rimuovi
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={confermaOrdine}
            disabled={!canSubmit || loading}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #ddd',
              opacity: (!canSubmit || loading) ? 0.5 : 1
            }}
          >
            {loading ? 'Invio...' : 'Conferma ordine'}
          </button>

          {msg && <span style={{ opacity: 0.8 }}>{msg}</span>}
        </div>

        <p style={{ opacity: 0.65, marginTop: 10 }}>
          Nota: per funzionare servono tabelle <code>ordini</code> e <code>ordini_righe</code> su Supabase.
          Se non esistono, ti verrà mostrato l’errore chiaro (senza poesia).
        </p>
      </div>
    </main>
  );
}


