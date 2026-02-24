'use client';

import Link from 'next/link';
import { useMemo } from 'react';

type TabKey = 'magazzino' | 'ordini' | 'dashboard' | 'completate' | 'clienti';

export default function DomobagsHeader({ active }: { active: TabKey }) {
  const tabs = useMemo(() => ([
    { key: 'magazzino', label: 'Magazzino', href: '/' },
    { key: 'ordini', label: 'Ordini', href: '/ordini' },
    { key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
    { key: 'completate', label: 'Completate', href: '/impegni' },
  ] as const), []);

  return (
    <header className="mx-auto w-full max-w-6xl px-6 pt-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-3">
            <img
              src="/domobags.png"
              alt="Domobags"
              className="h-9 w-9 rounded-lg object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="min-w-0">
              <div className="text-lg font-semibold leading-tight">Magazzino</div>
              <div className="text-xs text-neutral-500 truncate">
                {active === 'clienti' ? 'Clienti' : active === 'ordini' ? 'Ordini' : active === 'dashboard' ? 'Dashboard' : active === 'completate' ? 'Completate' : 'Articoli'}
              </div>
            </div>
          </div>
        </div>

        <nav className="flex items-center gap-2">
          {tabs.map(t => {
            const isActive = (active === t.key) || (active === 'clienti' && t.key === 'magazzino');
            return (
              <Link
                key={t.key}
                href={t.href}
                className={[
                  'px-4 py-2 rounded-full text-sm font-semibold transition',
                  isActive ? 'bg-teal-600 text-white shadow-sm' : 'text-neutral-700 hover:bg-neutral-100'
                ].join(' ')}
              >
                {t.label}
              </Link>
            );
          })}
          <Link
            href="/clienti"
            className={[
              'px-4 py-2 rounded-full text-sm font-semibold transition',
              active === 'clienti' ? 'bg-teal-600 text-white shadow-sm' : 'text-neutral-700 hover:bg-neutral-100'
            ].join(' ')}
          >
            Clienti
          </Link>
        </nav>
      </div>

      <div className="mt-4 h-px w-full bg-neutral-200" />
    </header>
  );
}