'use client';

import Link from 'next/link';

type TabKey = 'magazzino' | 'ordini' | 'dashboard' | 'completate' | 'clienti';

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={[
        'px-4 py-2 rounded-full text-sm font-semibold transition',
        active ? 'bg-teal-600 text-white shadow-sm' : 'text-neutral-700 hover:bg-neutral-100'
      ].join(' ')}
    >
      {children}
    </Link>
  );
}

export default function DomobagsHeader({ active }: { active: TabKey }) {
  return (
    <header className="w-full border-b border-neutral-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/domobags.png"
            alt="Domobags"
            className="h-9 w-9 rounded-lg object-contain"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="min-w-0">
            <div className="text-base font-semibold leading-tight text-neutral-900">Magazzino</div>
            <div className="text-xs text-neutral-500 truncate">
              {active === 'magazzino' ? 'Articoli' : active.charAt(0).toUpperCase() + active.slice(1)}
            </div>
          </div>
        </div>

        <nav className="flex items-center gap-2">
          <Tab href="/" active={active === 'magazzino'}>Magazzino</Tab>
          <Tab href="/ordini" active={active === 'ordini'}>Ordini</Tab>
          <Tab href="/dashboard" active={active === 'dashboard'}>Dashboard</Tab>
          <Tab href="/impegni" active={active === 'completate'}>Completate</Tab>
          <Tab href="/clienti" active={active === 'clienti'}>Clienti</Tab>
        </nav>
      </div>
    </header>
  );
}