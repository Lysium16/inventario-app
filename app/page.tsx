"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Articolo = {
  id: string;
  cod_articolo: string;
  descrizione: string;
  pz_per_scatola: number;
  scatole_inventario: number;
  scorta_minima: number;
  created_at: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

function formatInt(n: number) {
  return new Intl.NumberFormat("it-IT").format(n);
}

function clampNonNeg(n: number) {
  return n < 0 ? 0 : n;
}

function getStato(scatole: number, min: number) {
  if (scatole <= min) {
    return {
      key: "critico" as const,
      label: "Critico",
      pill: "bg-red-100 text-red-700 border-red-200",
      card: "card-critico",
    };
  }
  if (scatole <= min + 3) {
    return {
      key: "basso" as const,
      label: "Basso",
      pill: "bg-orange-100 text-orange-800 border-orange-200",
      card: "card-basso",
    };
  }
  return {
    key: "ok" as const,
    label: "OK",
    pill: "brand-pill",
    card: "",
  };
}

function priority(scatole: number, min: number) {
  const s = getStato(scatole, min).key;
  return s === "critico" ? 0 : s === "basso" ? 1 : 2;
}

type Filter = "tutti" | "critici" | "bassi";

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [articoli, setArticoli] = useState<Articolo[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("tutti");

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [cod, setCod] = useState("");
  const [desc, setDesc] = useState("");
  const [pzScatola, setPzScatola] = useState("");
  const [scatoleInv, setScatoleInv] = useState("");
  const [scortaMin, setScortaMin] = useState("");

  const [selected, setSelected] = useState<Articolo | null>(null);
  const [delta, setDelta] = useState("");
  const [editMin, setEditMin] = useState("");

  const [flash, setFlash] = useState<null | "green" | "red">(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1600);
  }

  async function loadArticoli() {
    setLoading(true);
    const { data, error } = await supabase.from("articoli").select("*");

    if (error) {
      alert(error.message);
      setLoading(false);
      return [] as Articolo[];
    }

    const list = (data || []) as Articolo[];
    setArticoli(list);
    setLoading(false);
    return list;
  }

  useEffect(() => {
    loadArticoli();
  }, []);

  useEffect(() => {
    if (!selected) return;
    const fresh = articoli.find((a) => a.id === selected.id);
    if (fresh) {
      setSelected(fresh);
      setEditMin(String(fresh.scorta_minima ?? 0));
    }
  }, [articoli]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return articoli
      .filter((a) => {
        const matchQ =
          !q ||
          a.cod_articolo.toLowerCase().includes(q) ||
          a.descrizione.toLowerCase().includes(q);

        if (!matchQ) return false;

        const stato = getStato(a.scatole_inventario ?? 0, a.scorta_minima ?? 0).key;
        if (filter === "critici") return stato === "critico";
        if (filter === "bassi") return stato === "basso";
        return true;
      })
      .sort((a, b) => {
        const pa = priority(a.scatole_inventario ?? 0, a.scorta_minima ?? 0);
        const pb = priority(b.scatole_inventario ?? 0, b.scorta_minima ?? 0);
        if (pa !== pb) return pa - pb;
        return a.descrizione.localeCompare(b.descrizione, "it", { sensitivity: "base" });
      });
  }, [articoli, query, filter]);

  const criticiCount = useMemo(() => {
    return articoli.filter((a) => getStato(a.scatole_inventario ?? 0, a.scorta_minima ?? 0).key === "critico").length;
  }, [articoli]);

  async function setFlashToast(sign: "+" | "-") {
    setFlash(sign === "+" ? "green" : "red");
    window.setTimeout(() => setFlash(null), 220);
    showToast(sign === "+" ? "Carico registrato" : "Scarico registrato");
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

    if (error) return alert(error.message);

    setDelta("");
    await setFlashToast(sign);

    const fresh = await loadArticoli();
    setSelected(fresh.find((a) => a.id === selected.id) || null);
  }

  async function quickStep(id: string, step: 1 | -1) {
    const a = articoli.find((x) => x.id === id);
    if (!a) return;

    const next = clampNonNeg((a.scatole_inventario || 0) + step);

    const { error } = await supabase
      .from("articoli")
      .update({ scatole_inventario: next })
      .eq("id", id);

    if (error) return alert(error.message);

    await setFlashToast(step === 1 ? "+" : "-");
    await loadArticoli();
  }

  async function saveScortaMinima() {
    if (!selected) return;

    const v = parseInt(editMin || "0", 10);
    if (!Number.isFinite(v) || v < 0) return alert("Scorta minima non valida.");

    const { error } = await supabase
      .from("articoli")
      .update({ scorta_minima: v })
      .eq("id", selected.id);

    if (error) return alert(error.message);

    showToast("Scorta minima aggiornata");
    const fresh = await loadArticoli();
    setSelected(fresh.find((a) => a.id === selected.id) || null);
  }

  async function addArticolo() {
    const cod_articolo = cod.trim();
    const descrizione = desc.trim();
    const pz_per_scatola = parseInt(pzScatola, 10);
    const scatole_inventario = parseInt(scatoleInv || "0", 10);
    const scorta_minima = parseInt(scortaMin || "0", 10);

    if (!cod_articolo) return alert("Inserisci il codice articolo.");
    if (!descrizione) return alert("Inserisci la descrizione.");
    if (!Number.isFinite(pz_per_scatola) || pz_per_scatola < 0) return alert("Pz per scatola non valido.");
    if (!Number.isFinite(scatole_inventario) || scatole_inventario < 0) return alert("Scatole inventario non valido.");
    if (!Number.isFinite(scorta_minima) || scorta_minima < 0) return alert("Scorta minima non valida.");

    const { error } = await supabase.from("articoli").insert({
      cod_articolo,
      descrizione,
      pz_per_scatola,
      scatole_inventario,
      scorta_minima,
    });

    if (error) return alert(error.message);

    setCod(""); setDesc(""); setPzScatola(""); setScatoleInv(""); setScortaMin("");
    setIsAddOpen(false);
    await loadArticoli();
    showToast("Articolo salvato");
  }

  async function deleteArticolo(id: string) {
    if (!confirm("Eliminare questo articolo?")) return;
    const { error } = await supabase.from("articoli").delete().eq("id", id);
    if (error) return alert(error.message);
    setSelected(null);
    await loadArticoli();
    showToast("Articolo eliminato");
  }

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-neutral-50 to-neutral-100 text-neutral-900">
      {/* Flash overlay */}
      {flash && (
        <div
          className={[
            "pointer-events-none absolute inset-0 z-50",
            flash === "green" ? "bg-green-200/28" : "bg-red-200/28",
            "animate-[flash_220ms_ease-out_1]",
          ].join(" ")}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-neutral-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Header Apple-like */}
      <header className="sticky top-0 z-20 border-b border-neutral-200/60 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-9 w-24 shrink-0 overflow-hidden rounded-xl bg-white">
              {/* logo (se presente) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/domobags-logo.png"
                alt="Domobags"
                className="h-full w-full object-contain"
              />
            </div>

            <div className="min-w-0">
              <div className="text-lg font-semibold tracking-tight">Magazzino Domobags</div>
              <div className="text-xs text-neutral-500">
                {loading ? "…" : `${filtered.length} articoli`} • {criticiCount} critici
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsAddOpen(true)}
            className="brand-btn rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
          >
            + Nuovo
          </button>
        </div>

        <div className="mx-auto max-w-6xl px-4 pb-3">
          <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cerca per codice o descrizione…"
                className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 pr-10 text-base shadow-sm outline-none focus:border-neutral-400"
              />
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">⌕</div>
            </div>

            <div className="flex gap-2">
              {(["tutti","critici","bassi"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={[
                    "rounded-2xl border px-3 py-2 text-sm shadow-sm",
                    filter === k
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
                  ].join(" ")}
                >
                  {k === "tutti" ? "Tutti" : k === "critici" ? "Critici" : "Bassi"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4 md:grid-cols-2">
        {/* Lista */}
        <section className="rounded-3xl border border-neutral-200 bg-white p-3 shadow-sm">
          {loading ? (
            <div className="p-3 text-sm text-neutral-500">Caricamento…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-neutral-500">
              Nessun articolo trovato.
              <div className="mt-2 text-xs text-neutral-400">Prova a cambiare filtro o ricerca.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((a) => {
                const stato = getStato(a.scatole_inventario ?? 0, a.scorta_minima ?? 0);

                return (
                  <div
                    key={a.id}
                    className={[
                      "rounded-2xl border border-neutral-200 bg-white p-3 hover:bg-neutral-50 transition",
                      stato.card,
                    ].join(" ")}
                  >
                    <button
                      onClick={() => { setSelected(a); setEditMin(String(a.scorta_minima ?? 0)); }}
                      className="w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{a.descrizione}</div>
                          <div className="truncate text-xs text-neutral-500">{a.cod_articolo}</div>

                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${stato.pill}`}>
                              {stato.label}
                            </span>
                            <span className="text-xs text-neutral-500">min {formatInt(a.scorta_minima ?? 0)}</span>
                          </div>

                          <div className="mt-2 text-xs text-neutral-500">
                            {formatInt((a.scatole_inventario ?? 0) * (a.pz_per_scatola ?? 0))} pz • {formatInt(a.pz_per_scatola ?? 0)} pz/scatola
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-3xl font-semibold leading-none">{formatInt(a.scatole_inventario ?? 0)}</div>
                          <div className="mt-1 text-xs text-neutral-500">scatole</div>
                        </div>
                      </div>
                    </button>

                    {/* Azioni rapide: NO preset multipli, solo +1/-1 come hai già */}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => quickStep(a.id, 1)}
                        className="brand-btn rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
                      >
                        +1
                      </button>
                      <button
                        onClick={() => quickStep(a.id, -1)}
                        className="rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm active:scale-[0.99]"
                      >
                        −1
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Dettaglio */}
        <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
          {!selected ? (
            <div className="flex h-full min-h-[240px] items-center justify-center text-sm text-neutral-500">
              Seleziona un articolo dalla lista
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-3xl border border-neutral-200 bg-gradient-to-b from-neutral-50 to-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{selected.descrizione}</div>
                    <div className="text-xs text-neutral-500">{selected.cod_articolo}</div>
                  </div>
                  <div>
                    {(() => {
                      const s = getStato(selected.scatole_inventario ?? 0, selected.scorta_minima ?? 0);
                      return (
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${s.pill}`}>
                          {s.label}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                    <div className="text-xs text-neutral-500">Scatole</div>
                    <div className="mt-1 text-2xl font-semibold">{formatInt(selected.scatole_inventario ?? 0)}</div>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                    <div className="text-xs text-neutral-500">Totale pezzi</div>
                    <div className="mt-1 text-2xl font-semibold">
                      {formatInt((selected.scatole_inventario ?? 0) * (selected.pz_per_scatola ?? 0))}
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-xs text-neutral-500">
                  {formatInt(selected.pz_per_scatola ?? 0)} pz/scatola
                </div>
              </div>

              {/* Scorta minima */}
              <div className="rounded-3xl border border-neutral-200 p-4">
                <div className="text-sm font-semibold">Scorta minima</div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={editMin}
                    onChange={(e) => setEditMin(e.target.value.replace(/[^\d]/g, ""))}
                    inputMode="numeric"
                    placeholder="es. 2"
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-neutral-400"
                  />
                  <button
                    onClick={saveScortaMinima}
                    className="brand-btn shrink-0 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
                  >
                    Salva
                  </button>
                </div>
              </div>

              {/* Movimento */}
              <div className="rounded-3xl border border-neutral-200 p-4">
                <label className="block text-xs text-neutral-500">Quantità scatole da aggiungere / togliere</label>
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
                    className="brand-btn rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
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

      {/* Modal Nuovo Articolo */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 md:items-center">
          <div className="w-full max-w-xl rounded-3xl border border-neutral-200 bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-base font-semibold">Nuovo articolo</div>
              <button
                onClick={() => setIsAddOpen(false)}
                className="rounded-2xl border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
              >
                Chiudi
              </button>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <input value={cod} onChange={(e) => setCod(e.target.value)} placeholder="Cod articolo (AC221029)"
                className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-neutral-400" />
              <input value={pzScatola} onChange={(e) => setPzScatola(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="Pz per scatola"
                className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-neutral-400" />
              <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descrizione (Avana cordino 22+10x29)"
                className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-neutral-400 md:col-span-2" />
              <input value={scatoleInv} onChange={(e) => setScatoleInv(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="Scatole in inventario (es. 10)"
                className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-neutral-400" />
              <input value={scortaMin} onChange={(e) => setScortaMin(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="Scorta minima (es. 2)"
                className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-neutral-400" />
            </div>

            <button onClick={addArticolo}
              className="brand-btn mt-3 w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.99]">
              Salva articolo
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
