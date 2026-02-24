'use client';

import Link from 'next/link';

import DomobagsHeader from '../../components/DomobagsHeader';
export const dynamic = 'force-dynamic';


import React, { useEffect, useState } from 'react';


import { supabase } from '../../lib/supabaseClient';


type Cliente = { id: string; nome: string };





export default function ClientiPage() {


  const [nome, setNome] = useState('');


  const [clienti, setClienti] = useState<Cliente[]>([]);


  const [msg, setMsg] = useState<string | null>(null);


  const [loading, setLoading] = useState(false);





  async function load() {


    const { data, error } = await supabase


      .from('clienti')


      .select('id,nome')


      .order('nome', { ascending: true });





    if (error) { setMsg('Errore caricamento clienti: ' + error.message); return; }


    setClienti((data as any[]) ?? []);


  }





  useEffect(() => { load(); }, []);





  async function addCliente() {


    setMsg(null);


    const n = nome.trim();


    if (!n) return;


    setLoading(true);


    try {


      const { error } = await supabase.from('clienti').insert({ nome: n });


      if (error) throw error;


      setNome('');


      await load();


      setMsg('Cliente aggiunto.');


    } catch (e: any) {


      setMsg('Errore: ' + (e?.message ?? String(e)));


    } finally {


      setLoading(false);


    }


  }





  return (<>

      <DomobagsHeader active="clienti" />

    <main style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>


      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Clienti</h1>





      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>


        <div style={{ display: 'flex', gap: 10 }}>


          <input


            value={nome}


            onChange={e => setNome(e.target.value)}


            placeholder="Nome cliente (es. Rossi SRL)"


            style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #ddd' }}


          />


          <button


            onClick={addCliente}


            disabled={loading || !nome.trim()}


            style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #ddd', opacity: (loading || !nome.trim()) ? 0.5 : 1 }}


          >


            {loading ? '...' : 'Aggiungi'}


          </button>


        </div>





        {msg && <div style={{ opacity: 0.8 }}>{msg}</div>}





        <div style={{ border: '1px solid #eee', borderRadius: 14, padding: 14 }}>


          <h2 style={{ margin: 0, fontSize: 18 }}>Elenco</h2>


          <ul style={{ marginTop: 10 }}>


            {clienti.map(c => <li key={c.id}>{c.nome}</li>)}


          </ul>


        </div>





        <p style={{ opacity: 0.65 }}>


          Serve tabella <code>clienti</code> su Supabase (campi minimi: <code>id</code> uuid, <code>nome</code> text).


        </p>


      </div>


    </main>


  </>


  );


}








