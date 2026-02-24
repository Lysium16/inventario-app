-- Permessi base (in caso mancassero)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.clienti to anon, authenticated;
grant select, insert, update, delete on table public.ordini to anon, authenticated;
grant select, insert, update, delete on table public.ordini_righe to anon, authenticated;

-- Abilita RLS (idempotente)
alter table public.clienti enable row level security;
alter table public.ordini enable row level security;
alter table public.ordini_righe enable row level security;

-- Policy "allow all" (idempotenti: crea solo se non esistono già con quel nome)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='clienti' and policyname='clienti_all') then
    create policy clienti_all on public.clienti for all using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ordini' and policyname='ordini_all') then
    create policy ordini_all on public.ordini for all using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ordini_righe' and policyname='ordini_righe_all') then
    create policy ordini_righe_all on public.ordini_righe for all using (true) with check (true);
  end if;
end$$;