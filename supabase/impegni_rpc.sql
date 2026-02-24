create extension if not exists pgcrypto;

create or replace function public.impegno_add(
  p_cliente text,
  p_articolo_id text,
  p_scatole integer
)
returns uuid
language plpgsql
as \$\$
declare
  new_id uuid;
begin
  if p_scatole is null or p_scatole <= 0 then
    raise exception 'scatole must be > 0';
  end if;

  insert into public.impegni_clienti(cliente, articolo_id, scatole, stato)
  values (trim(p_cliente), trim(p_articolo_id), p_scatole, 'IMPEGNATO')
  returning id into new_id;

  update public.articoli
  set scatole_impegnate = coalesce(scatole_impegnate, 0) + p_scatole
  where id = p_articolo_id;

  if not found then
    raise exception 'Articolo non trovato: %', p_articolo_id;
  end if;

  return new_id;
end;
\$\$;

create or replace function public.impegno_set_stato(
  p_id uuid,
  p_stato text
)
returns void
language plpgsql
as \$\$
declare
  v_articolo_id text;
  v_scatole integer;
  v_old text;
begin
  select articolo_id, scatole, stato
    into v_articolo_id, v_scatole, v_old
  from public.impegni_clienti
  where id = p_id;

  if not found then
    raise exception 'Impegno non trovato: %', p_id;
  end if;

  if p_stato not in ('IMPEGNATO','COMPLETATO') then
    raise exception 'Stato non valido: %', p_stato;
  end if;

  if v_old = p_stato then
    return;
  end if;

  update public.impegni_clienti
  set stato = p_stato
  where id = p_id;

  if p_stato = 'COMPLETATO' then
    update public.articoli
    set scatole_impegnate = greatest(coalesce(scatole_impegnate,0) - v_scatole, 0)
    where id = v_articolo_id;
  else
    update public.articoli
    set scatole_impegnate = coalesce(scatole_impegnate,0) + v_scatole
    where id = v_articolo_id;
  end if;

  if not found then
    raise exception 'Articolo non trovato: %', v_articolo_id;
  end if;
end;
\$\$;
