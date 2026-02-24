"use client";

import { useEffect, useState } from "react";
import TopNav from "../components/TopNav";
import { supabase } from "../../lib/supabaseClient";

type Row = {
  id: string;
  scatole: number;
  completed_at: string | null;
  clienti_nome: string | null;
  articolo_codice: string | null;
  articolo_desc: string | null;
};

export default function CompletatePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("ordini_righe")
      .select(`
        id, scatole, stato, completed_at,
        articoli:articolo_id ( codice, descrizione ),
        ordini:ordine_id ( cliente_id ),
        clienti:ordini(cliente_id) ( nome )
      `)
      .eq("stato", "COMPLETATO")
      .order("completed_at", { ascending: false });

    setLoading(false);
    if (error) {
      console.error(error);
      return;
    }

    const mapped: Row[] =
      (data ?? []).map((r: any) => ({
        id: r.id,
        scatole: r.scatole,
        completed_at: r.completed_at ?? null,
        clienti_nome: r.clienti?.nome ?? null,
        articolo_codice: r.articoli?.codice ?? null,
        articolo_desc: r.articoli?.descrizione ?? null,
      })) ?? [];

    setRows(mapped);
  }

  useEffect(() => { load(); }, []);

  return (
    <>
      <TopNav activePath="/completate" />
      <main className="db-page">
        <div className="db-card">
          <div className="db-card__hd">
            <div>
              <h1 style={{ margin: 0 }}>Completate</h1>
              <div className="db-muted">Storico righe completate (stock scalato automaticamente).</div>
            </div>
            <button className="db-btn" onClick={load} disabled={loading}>Aggiorna</button>
          </div>

          <div className="db-card__bd">
            {rows.length === 0 ? (
              <div className="db-muted">Nessuna riga completata.</div>
            ) : (
              <table className="db-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Articolo</th>
                    <th>Scatole</th>
                    <th>Completato il</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.clienti_nome ?? <span className="db-muted">-</span>}</td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{r.articolo_codice ?? "-"}</div>
                        <div className="db-muted">{r.articolo_desc ?? ""}</div>
                      </td>
                      <td style={{ fontWeight: 800 }}>{r.scatole}</td>
                      <td className="db-muted">{r.completed_at ? new Date(r.completed_at).toLocaleString() : "-"}</td>
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