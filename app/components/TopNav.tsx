import Link from "next/link";

type Item = { href: string; label: string };

const items: Item[] = [
  { href: "/", label: "Magazzino" },
  { href: "/ordini", label: "Ordini clienti" },
  { href: "/dashboard", label: "In lavorazione" },
  { href: "/completate", label: "Completate" },
  { href: "/clienti", label: "Clienti" },
];

export default function TopNav({ activePath }: { activePath: string }) {
  return (
    <header className="db-topbar">
      <div className="db-topbar__inner">
        <div className="db-brand">
          <div className="db-brand__logo">Domobags</div>
          <div className="db-brand__sub">Magazzino</div>
        </div>

        <nav className="db-nav">
          {items.map((it) => {
            const active = activePath === it.href;
            return (
              <Link
                key={it.href}
                href={it.href}
                className={active ? "db-nav__item db-nav__item--active" : "db-nav__item"}
              >
                {it.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}