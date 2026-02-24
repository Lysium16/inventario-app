"use client";

import { useEffect, useMemo, useState } from "react";
import TopNav from "../components/TopNav";
import { supabase } from "../../lib/supabaseClient";

type Row = {
  id: string;
  ordine_id: string;
  scatole: number;
  stato: string;
  created_at: string;
  completed_at: string | null;
  clienti_nome: string | null;
  articolo_codice: string | null;
  articolo_desc: string | null;
};

export default function DashboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("ordini_righe")
      .select(`
        id, ordine_id, scatole, stato, created_at, completed_at,
        ordini:ordine_id ( id, cliente_id, stato, created_at ),
        articoli:articolo_id ( id, codice, descrizione ),
        clienti:ordini(cliente_id) ( id, nome )
      `)
      .neq("stato", "COMPLETATO")
      .order("created_at", { ascending: false });

    setLoading(false);
    if (error) {
      console.error(error);
      return;
    }

    const mapped: Row[] =
      (data ?? []).map((r: any) => ({
        id: r.id,
        ordine_id: r.ordine_id,
        scatole: r.scatole,
        stato: r.stato,
        created_at: r.created_at,
        completed_at: r.completed_at ?? null,
        clienti_nome: r.clienti?.nome ?? null,
        articolo_codice: r.articoli?.codice ?? null,
        articolo_desc: r.articoli?.descrizione ?? null,
      })) ?? [];

    setRows(mapped);
    setSel({});
  }

  useEffect(() => { load(); }, []);

  const anySelected = useMemo(() => Object.values(sel).some(Boolean), [sel]);

  async function markCompleted() {
    const ids = Object.keys(sel).filter((k) => sel[k]);
    if (ids.length === 0) return;

    const { error } = await supabase
      .from("ordini_righe")
      .update({ stato: "COMPLETATO", completed_at: new Date().toISOString() })
      .in("id", ids);

    if (error) {
      console.error(error);
      alert("Errore nel completamento. Vedi console.");
      return;
    }

    await load();
  }

  return (
    <>
      <TopNav activePath="/dashboard" />
      <main className="db-page">
        <div className="db-card">
          <div className="db-card__hd">
            <div>
              <h1 style={{ margin: 0 }}>In lavorazione</h1>
              <div className="db-muted">Queste sono le righe attualmente impegnate (non completate).</div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="db-btn" onClick={load} disabled={loading}>
                Aggiorna
              </button>
              <button className="db-btn db-btn--primary" onClick={markCompleted} disabled={!anySelected}>
                Segna completate
              </button>
            </div>
          </div>

          <div className="db-card__bd">
            {rows.length === 0 ? (
              <div className="db-muted">Nessuna lavorazione in corso.</div>
            ) : (
              <table className="db-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Cliente</th>
                    <th>Articolo</th>
                    <th>Scatole</th>
                    <th>Stato</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!sel[r.id]}
                          onChange={(e) => setSel((s) => ({ ...s, [r.id]: e.target.checked }))}
                        />
                      </td>
                      <td>{r.clienti_nome ?? <span className="db-muted">-</span>}</td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{r.articolo_codice ?? "-"}</div>
                        <div className="db-muted">{r.articolo_desc ?? ""}</div>
                      </td>
                      <td style={{ fontWeight: 800 }}>{r.scatole}</td>
                      <td><span className="db-badge">{r.stato}</span></td>
                      <td className="db-muted">{new Date(r.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </>
  );
}