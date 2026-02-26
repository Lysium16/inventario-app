create or replace function public.complete_order_lines(p_righe uuid[])
returns void
language plpgsql
as $function$
declare
  v_r record;
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
    update public.articoli
    set
      scatole_inventario = greatest(coalesce(scatole_inventario,0) - coalesce(v_r.scatole,0)::int, 0),
      scatole_impegnate  = greatest(coalesce(scatole_impegnate,0)  - coalesce(v_r.scatole,0)::int, 0)
    where id = v_r.articolo_id;

    update public.ordini_righe
    set stato = 'COMPLETATO',
        completed_at = now()
    where id = v_r.id;
  end loop;
end;
$function$;