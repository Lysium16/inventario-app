import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen p-6 sm:p-10">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Inventario
          </h1>
          <p className="text-sm sm:text-base text-neutral-500">
            Gestione magazzino Domobags: articoli, clienti e ordini. Senza scenette.
          </p>
        </header>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Navigazione</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link
              href="/"
              className="rounded-2xl border border-neutral-200 p-4 hover:bg-neutral-50 transition"
            >
              <div className="text-sm text-neutral-500">Magazzino</div>
              <div className="mt-1 font-semibold">Articoli</div>
              <div className="mt-2 text-sm text-neutral-500">
                Consulta e aggiorna disponibilità.
              </div>
            </Link>

            <Link
              href="/clienti"
              className="rounded-2xl border border-neutral-200 p-4 hover:bg-neutral-50 transition"
            >
              <div className="text-sm text-neutral-500">Anagrafiche</div>
              <div className="mt-1 font-semibold">Clienti</div>
              <div className="mt-2 text-sm text-neutral-500">
                Gestisci i clienti collegati agli ordini.
              </div>
            </Link>

            <Link
              href="/ordini"
              className="rounded-2xl border border-neutral-200 p-4 hover:bg-neutral-50 transition"
            >
              <div className="text-sm text-neutral-500">Flusso</div>
              <div className="mt-1 font-semibold">Ordini</div>
              <div className="mt-2 text-sm text-neutral-500">
                Crea e gestisci ordini e righe.
              </div>
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 p-4 sm:p-6 bg-white">
          <h2 className="text-lg font-semibold">Stato</h2>
          <p className="mt-2 text-sm text-neutral-500">
            Se qualcosa non si popola (clienti/ordini), il problema è quasi sempre uno tra:
            env vars su Vercel, import Supabase sbagliato, o RLS/policy.
          </p>
        </section>
      </div>
    </main>
  );
}