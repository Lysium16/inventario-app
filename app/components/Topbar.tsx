"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Magazzino" },
  { href: "/ordini", label: "Ordini clienti" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/completate", label: "Completate" },
  { href: "/clienti", label: "Clienti" },
];

export default function Topbar() {
  const p = usePathname();

  return (
    <div className="w-full border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="text-lg font-semibold">Domobags</div>
          <div className="text-sm text-gray-500">Magazzino</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((t) => {
            const active = p === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={
                  "rounded-full px-4 py-2 text-sm font-semibold border " +
                  (active
                    ? "bg-teal-600 text-white border-teal-600"
                    : "bg-white text-gray-800 border-gray-200 hover:bg-gray-50")
                }
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}