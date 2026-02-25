-- RPC: conferma ordine -> incrementa impegnate (e scatole_impegnate se presente)
create or replace function public.confirm_order(p_ordine_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.articoli a
  set
    impegnate = coalesce(a.impegnate,0) + x.tot,
    scatole_impegnate = coalesce(a.scatole_impegnate,0) + x.tot
  from (
    select articolo_id, sum(scatole)::int as tot
    from public.ordini_righe
    where ordine_id = p_ordine_id
    group by articolo_id
  ) x
  where a.id = x.articolo_id;

  update public.ordini
  set stato = 'IN_LAVORAZIONE'
  where id = p_ordine_id and stato = 'CREATO';
end;
$$;

-- RPC: completa righe -> scala magazzino + impegnate, marca righe completate,
-- e se un ordine non ha più righe aperte lo marca COMPLETATO.
create or replace function public.complete_order_lines(p_righe uuid[])
returns void
language plpgsql
security definer
as $$
declare
  r record;
  oid uuid;
begin
  for r in
    select id, ordine_id, articolo_id, scatole
    from public.ordini_righe
    where id = any(p_righe)
  loop
    update public.articoli
    set
      impegnate = greatest(0, coalesce(impegnate,0) - coalesce(r.scatole,0)),
      scatole_impegnate = greatest(0, coalesce(scatole_impegnate,0) - coalesce(r.scatole,0)),
      magazzino = greatest(0, coalesce(magazzino,0) - coalesce(r.scatole,0)),
      scatole_inventario = greatest(0, coalesce(scatole_inventario,0) - coalesce(r.scatole,0))
    where id = r.articolo_id;

    update public.ordini_righe
    set stato = 'COMPLETATO', completed_at = now()
    where id = r.id;

    oid := r.ordine_id;

    if not exists (
      select 1 from public.ordini_righe
      where ordine_id = oid and stato <> 'COMPLETATO'
    ) then
      update public.ordini
      set stato = 'COMPLETATO', completed_at = now()
      where id = oid;
    end if;
  end loop;
end;
$$;