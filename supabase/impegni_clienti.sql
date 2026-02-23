-- ESEGUI QUESTO NEL SQL EDITOR DI SUPABASE (una volta sola)
-- Tabella: impegni_clienti

create table if not exists public.impegni_clienti (
  id uuid primary key default gen_random_uuid(),
  cliente text not null,
  articolo_id text not null,
  scatole integer not null check (scatole > 0),
  stato text not null default 'IMPEGNATO' check (stato in ('IMPEGNATO','COMPLETATO')),
  created_at timestamptz not null default now()
);

create index if not exists impegni_clienti_created_at_idx on public.impegni_clienti (created_at desc);
create index if not exists impegni_clienti_articolo_id_idx on public.impegni_clienti (articolo_id);
create index if not exists impegni_clienti_cliente_idx on public.impegni_clienti (cliente);

-- RLS (minimo indispensabile). Se hai già politiche standard, adattale.
alter table public.impegni_clienti enable row level security;

-- Permetti lettura a utenti anon/public (COME SPESSO SI FA IN APP INTERNE).
-- Se vuoi bloccarlo, togli queste policy e usa auth.
drop policy if exists "read impegni_clienti" on public.impegni_clienti;
create policy "read impegni_clienti"
on public.impegni_clienti
for select
to anon, authenticated
using (true);

drop policy if exists "insert impegni_clienti" on public.impegni_clienti;
create policy "insert impegni_clienti"
on public.impegni_clienti
for insert
to anon, authenticated
with check (true);

drop policy if exists "update impegni_clienti" on public.impegni_clienti;
create policy "update impegni_clienti"
on public.impegni_clienti
for update
to anon, authenticated
using (true)
with check (true);
