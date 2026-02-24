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
    <header style={{ borderBottom: "1px solid #e9ecef", background: "#fff" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "14px 18px", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Domobags</div>
          <div style={{ color: "#6b7280", fontSize: 13 }}>Magazzino</div>
        </div>

        <nav style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
          {tabs.map(t => {
            const active = (t.href === "/" ? p === "/" : p?.startsWith(t.href));
            return (
              <Link
                key={t.href}
                href={t.href}
                style={{
                  textDecoration: "none",
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: active ? "#0ea5a4" : "#fff",
                  color: active ? "#fff" : "#111827",
                  fontWeight: 800,
                  fontSize: 13,
                }}
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