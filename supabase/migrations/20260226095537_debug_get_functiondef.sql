create or replace function public.debug_get_functiondef(fname text)
returns text
language sql
security definer
as $$
  select pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = fname
  limit 1;
$$;