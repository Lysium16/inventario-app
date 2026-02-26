create or replace function public.complete_order_lines(p_righe uuid[])
returns void
language plpgsql
as $function$
declare
  v_r record;
  v_pz_per_scatola int;
  v_pz int;
begin
  if p_righe is null or array_length(p_righe, 1) is null then
    raise exception 'p_righe vuoto';
  end if;

  for v_r in
    select id, articolo_id, scatole
    from public.ordini_righe
    where id = any(p_righe)
    for update
  loop
    select coalesce(pz_per_scatola,1)
      into v_pz_per_scatola
    from public.articoli
    where id = v_r.articolo_id;

    v_pz := (v_r.scatole::int) * (v_pz_per_scatola::int);

    update public.articoli
    set
      magazzino = magazzino - v_pz,
      scatole_inventario = scatole_inventario - v_r.scatole::int,
      scatole_impegnate = greatest(coalesce(scatole_impegnate,0) - v_r.scatole::int, 0)
    where id = v_r.articolo_id;

    update public.ordini_righe
    set stato = 'COMPLETATO',
        completed_at = now()
    where id = v_r.id;
  end loop;
end;
$function$;