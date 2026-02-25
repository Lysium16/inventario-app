'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function Tab({ href, label }: { href: string; label: string }) {
  const p = usePathname() || '';
  const active = p === href;
  return (
    <Link
      href={href}
      className={
        'rounded-full px-4 py-2 text-sm font-semibold border ' +
        (active
          ? 'bg-teal-600 text-white border-teal-600'
          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300')
      }
    >
      {label}
    </Link>
  );
}

export default function Topbar() {
  return (
    <header className="border-b border-slate-100 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center gap-4">
        <div className="font-extrabold text-slate-900">Domobags</div>
        <div className="text-sm text-slate-500">Magazzino</div>
        <div className="ml-auto flex items-center gap-2">
          <Tab href="/" label="Magazzino" />
          <Tab href="/ordini" label="Ordini clienti" />
          <Tab href="/dashboard" label="Dashboard" />
          <Tab href="/completate" label="Completate" />
          <Tab href="/clienti" label="Clienti" />
        </div>
      </div>
    </header>
  );
}