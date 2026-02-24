import DomobagsHeader from '../../components/DomobagsHeader';

export const dynamic = 'force-dynamic';

export default function ImpegniPage() {
  return (
    <>
      <DomobagsHeader active="completate" />
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-3xl font-semibold tracking-tight">Completate</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Qui gestiremo il flusso “impegnate → completate” e lo storico. La pagina ora è pulita e coerente.
        </p>

        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-neutral-700">
            Prossimo step: collegare impegni/arrivi/ordini allo stock reale senza rompere il Magazzino (per una volta).
          </div>
        </section>
      </main>
    </>
  );
}