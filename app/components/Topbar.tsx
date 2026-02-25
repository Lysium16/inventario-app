'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Topbar() {
  const path = usePathname() || '/';

  const tabs = [
    { href: '/', label: 'Magazzino' },
    { href: '/ordini', label: 'Ordini clienti' },
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/completate', label: 'Completate' },
    { href: '/clienti', label: 'Clienti' },
  ];

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
        <div className="font-extrabold tracking-tight">Domobags</div>
        <div className="text-sm text-slate-600">Magazzino</div>

        <nav className="ml-auto flex items-center gap-2">
          {tabs.map(t => {
            const active = (t.href === '/' ? path === '/' : path.startsWith(t.href));
            return (
              <Link
                key={t.href}
                href={t.href}
                className={
                  "rounded-full px-4 py-2 text-sm font-bold border " +
                  (active ? "bg-teal-600 text-white border-teal-600" : "bg-white text-slate-800 border-slate-200 hover:border-slate-300")
                }
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}