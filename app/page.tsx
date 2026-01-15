"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Articolo = {
  id: string;
  cod_articolo: string;
  descrizione: string;
  pz_per_scatola: number;
  scatole_inventario: number;
  created_at: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [articoli, setArticoli] = useState<Articolo[]>([]);
  const [query, setQuery] = useState("");

  // Form nuovo articolo
  const [cod, setCod] = useState("");
  const [desc, setDesc] = useState("");
  const [pzScatola, setPzScatola] = useState("");
  const [scatoleInv, setScatoleInv] = useState("");

  // Dettaglio / modifica
  const [selected, setSelected] = useState<Articolo | null>(null);
  const [delta, setDelta] = useState("");

  async function loadArticoli() {
    setLoading(true);
    const { data, error } = await supabase
      .from("articoli")
      .select("*")
      .order("descrizione", { ascending: true });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    setArticoli(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadArticoli();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = [...articoli].sort((a, b) =>
      a.descrizione.localeCompare(b.descrizione, "it", { sensitivity: "base" })
    );

    if (!q) return base;

    return base.filter((a) => {
      return (
        a.cod_articolo.toLowerCase().includes(q) ||
        a.descrizione.toLowerCase().includes(q)
      );
    });
  }, [articoli, query]);

  function pezziTotali(a: Articolo) {
    return (a.scatole_inventario || 0) * (a.pz_per_scatola || 0);
  }

  async function addArticolo() {
    const cod_articolo = cod.trim();
    const descrizione = desc.trim();
    const pz_per_scatola = parseInt(pzScatola, 10);
    const scatole_inventario = parseInt(scatoleInv || "0", 10);

    if (!cod_articolo) return alert("Inserisci il codice articolo.");
    if (!descrizione) return alert("Inserisci la descrizione.");
    if (!Number.isFinite(pz_per_scatola) || pz_per_scatola < 0)
      return alert("Pz per scatola non valido.");
    if (!Number.isFinite(scatole_inventario) || scatole_inventario < 0)
      return alert("Scatole inventario non valido.");

    const { error } = await supabase.from("articoli").insert({
      cod_articolo,
      descrizione,
      pz_per_scatola,
      scatole_inventario,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setCod("");
    setDesc("");
    setPzScatola("");
    setScatoleInv("");

    await loadArticoli();
  }

  async function applyDelta(sign: "+" | "-") {
    if (!selected) return;

    const n = parseInt(delta, 10);
    if (!Number.isFinite(n) || n <= 0) return alert("Inserisci una quantità valida.");

    const current = selected.scatole_inventario || 0;
    const next = sign === "+" ? current + n : current - n;

    if (next < 0) return alert("Non puoi andare sotto zero.");

    const { error } = await supabase
      .from("articoli")
      .update({ scatole_inventario: next })
      .eq("id", selected.id);

    if (error) {
      alert(error.message);
      return;
    }

    setDelta("");
    await loadArticoli();

    // aggiorna selected con i dati freschi
    const updated = articoli.find((a) => a.id === selected.id);
    setSelected(updated || null);
  }

  async function deleteArticolo(id: string) {
    if (!confirm("Eliminare questo articolo?")) return;
    const { error } = await supabase.from("articoli").delete().eq("id", id);
    if (error) return alert(error.message);
    setSelected(null);
    await loadArticoli();
  }

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
          <p className="text-sm text-neutral-500">
            Borse in carta & scatole — gestione semplice con + / −
          </p>
        </header>

        {/* Ricerca */}
        <div className="mb-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca per codice o descrizione…"
            className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-neutral-400"
          />
        </div>

        {/* Layout */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Lista */}
          <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Articoli</h2>
              <span className="text-xs text-neutral-500">
                {loading ? "…" : `${filtered.length} tot`}
              </span>
            </div>

            {loading ? (
              <p className="text-sm text-neutral-500">Caricamento…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-neutral-500">Nessun articolo trovato.</p>
            ) : (
              <div className="space-y-2">
                {filtered.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelected(a)}
                    className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                      selected?.id === a.id
                        ? "border-neutral-900 bg-neutral-50"
                        : "border-neutral-200 bg-white hover:bg-neutral-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{a.descrizione}</div>
                        <div className="text-xs text-neutral-500">{a.cod_articolo}</div>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-semibold">
                          {a.scatole_inventario}
                        </div>
                        <div className="text-xs text-neutral-500">scatole</div>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-neutral-500">
                      {pezziTotali(a)} pz totali • {a.pz_per_scatola} pz/scatola
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Dettaglio + Azioni */}
          <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-base font-semibold">Dettaglio</h2>

            {!selected ? (
              <p className="text-sm text-neutral-500">
                Seleziona un articolo dalla lista.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                  <div className="text-sm font-semibold">{selected.descrizione}</div>
                  <div className="text-xs text-neutral-500">{selected.cod_articolo}</div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl bg-white p-3">
                      <div className="text-xs text-neutral-500">Scatole</div>
                      <div className="text-xl font-semibold">
                        {selected.scatole_inventario}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white p-3">
                      <div className="text-xs text-neutral-500">Totale pezzi</div>
                      <div className="text-xl font-semibold">
                        {pezziTotali(selected)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-neutral-500">
                    {selected.pz_per_scatola} pz/scatola
                  </div>
                </div>

                <div className="rounded-2xl border border-neutral-200 p-3">
                  <label className="block text-xs text-neutral-500">
                    Quantità scatole da aggiungere/togliere
                  </label>
                  <input
                    value={delta}
                    onChange={(e) => setDelta(e.target.value.replace(/[^\d]/g, ""))}
                    inputMode="numeric"
                    placeholder="es. 2"
                    className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-neutral-400"
                  />

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => applyDelta("+")}
                      className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
                    >
                      + Carico
                    </button>
                    <button
                      onClick={() => applyDelta("-")}
                      className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 shadow-sm active:scale-[0.99]"
                    >
                      − Scarico
                    </button>
                  </div>

                  <button
                    onClick={() => deleteArticolo(selected.id)}
                    className="mt-3 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600 hover:bg-neutral-50"
                  >
                    Elimina articolo
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Aggiungi articolo */}
        <section className="mt-4 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold">Aggiungi articolo</h2>

          <div className="grid gap-2 md:grid-cols-4">
            <input
              value={cod}
              onChange={(e) => setCod(e.target.value)}
              placeholder="Cod articolo (AC221029)"
              className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-neutral-400"
            />
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Descrizione (Avana cordino 22+10x29)"
              className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-neutral-400 md:col-span-2"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={pzScatola}
                onChange={(e) => setPzScatola(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                placeholder="Pz/scatola"
                className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-neutral-400"
              />
              <input
                value={scatoleInv}
                onChange={(e) => setScatoleInv(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                placeholder="Scatole inv."
                className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-neutral-400"
              />
            </div>
          </div>

          <button
            onClick={addArticolo}
            className="mt-3 rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
          >
            Salva articolo
          </button>
        </section>
      </div>
    </main>
  );
}
