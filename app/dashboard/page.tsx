import DomobagsHeader from '../../components/DomobagsHeader';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  return (
    <>
      <DomobagsHeader active="dashboard" />
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Qui arriveranno riepiloghi e indicatori. Per ora: niente 404 e niente teatro.
        </p>
      </main>
    </>
  );
}