'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from "../../lib/supabaseClient";

type Impegno = {
  id: string;
  cliente: string;
  articoloId: string;
  scatole: number;
  stato: 'IMPEGNATO' | 'COMPLETATO';
  created_at: string;
};

export default function ImpegniPage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Impegno[]>([]);
  const [cliente, setCliente] = useState('');
  const [articoloId, setArticoloId] = useState('');
  const [scatole, setScatole] = useState<number>(1);
  const [err, setErr] = useState<string>('');

  const canSubmit = useMemo(() => {
    return cliente.trim().length > 0 && articoloId.trim().length > 0 && Number.isFinite(scatole) && scatole > 0;
  }, [cliente, articoloId, scatole]);

  async function load() {
    setErr('');
    const { data, error } = await supabase
      .from('impegni_clienti')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      setErr(error.message);
      return;
    }
    setRows((data ?? []) as Impegno[]);
  }

  useEffect(() => {
    load();
  }, []);

  async function addImpegno(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setErr('');
    try {
      const payload = {
        cliente: cliente.trim(),
        articoloId: articoloId.trim(),
        scatole: Math.floor(Number(scatole)),
        stato: 'IMPEGNATO',
      };

      const { data, error } = await supabase.rpc('impegno_add', { p_cliente: cliente, p_articolo_id: articoloId, p_scatole: scatole });
if (error) throw error;

      setCliente('');
      setArticoloId('');
      setScatole(1);
      await load();
    } catch (ex: any) {
      setErr(ex?.message ?? 'Errore inserimento impegno');
    } finally {
      setLoading(false);
    }
  }

  async function setStato(id: string, stato: 'IMPEGNATO' | 'COMPLETATO') {
    setLoading(true);
    setErr('');
    try {
      const { error } = await supabase
        .from('impegni_clienti')
        .update({ stato })
        .eq('id', id);

      if (error) throw error;
      await load();
    } catch (ex: any) {
      setErr(ex?.message ?? 'Errore update stato');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Impegni clienti</h1>
      <p style={{ opacity: 0.75, marginTop: 0 }}>
        Aggiungi scatole impegnate collegandole a un cliente. Sì, finalmente sappiamo chi ha prenotato cosa.
      </p>

      {err ? (
        <div style={{ padding: 12, borderRadius: 10, border: '1px solid rgba(0,0,0,0.15)', marginBottom: 16 }}>
          <b>Errore:</b> {err}
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            Se è “relation does not exist”, non hai ancora eseguito il file SQL: <code>supabase/impegni_clienti.sql</code>.
          </div>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 18 }}>
        <form onSubmit={addImpegno} style={{ padding: 16, borderRadius: 12, border: '1px solid rgba(0,0,0,0.12)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 160px 140px', gap: 12, alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Cliente</span>
              <input
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                placeholder="Es. Mario Rossi / Azienda X"
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.2)' }}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Articolo ID (codice)</span>
              <input
                value={articoloId}
                onChange={(e) => setArticoloId(e.target.value)}
                placeholder="Es. AC221029"
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.2)' }}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Scatole</span>
              <input
                type="number"
                min={1}
                value={scatole}
                onChange={(e) => setScatole(Number(e.target.value))}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.2)' }}
              />
            </label>

            <button
              type="submit"
              disabled={!canSubmit || loading}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid rgba(0,0,0,0.2)',
                cursor: (!canSubmit || loading) ? 'not-allowed' : 'pointer',
                fontWeight: 650,
              }}
            >
              {loading ? '...' : 'Impegna'}
            </button>
          </div>
        </form>

        <div style={{ padding: 16, borderRadius: 12, border: '1px solid rgba(0,0,0,0.12)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>Elenco impegni</h2>
            <button
              onClick={load}
              disabled={loading}
              style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.2)', cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              Aggiorna
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(0,0,0,0.12)' }}>
                  <th style={{ padding: '10px 8px' }}>Data</th>
                  <th style={{ padding: '10px 8px' }}>Cliente</th>
                  <th style={{ padding: '10px 8px' }}>Articolo</th>
                  <th style={{ padding: '10px 8px' }}>Scatole</th>
                  <th style={{ padding: '10px 8px' }}>Stato</th>
                  <th style={{ padding: '10px 8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '12px 8px', opacity: 0.7 }}>
                      Nessun impegno salvato.
                    </td>
                  </tr>
                ) : rows.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                    <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 8px' }}>{r.cliente}</td>
                    <td style={{ padding: '10px 8px' }}>{r.articoloId}</td>
                    <td style={{ padding: '10px 8px' }}>{r.scatole}</td>
                    <td style={{ padding: '10px 8px' }}>{r.stato}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {r.stato === 'IMPEGNATO' ? (
                        <button
                          onClick={() => setStato(r.id, 'COMPLETATO')}
                          disabled={loading}
                          style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.2)', cursor: loading ? 'not-allowed' : 'pointer' }}
                        >
                          Completa
                        </button>
                      ) : (
                        <button
                          onClick={() => setStato(r.id, 'IMPEGNATO')}
                          disabled={loading}
                          style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.2)', cursor: loading ? 'not-allowed' : 'pointer' }}
                        >
                          Riapri
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </div>

      <div style={{ opacity: 0.7, fontSize: 12 }}>
        File SQL da eseguire su Supabase: <code>supabase/impegni_clienti.sql</code>
      </div>
    </div>
  );
}







