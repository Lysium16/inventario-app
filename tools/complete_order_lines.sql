CREATE OR REPLACE FUNCTION public.complete_order_lines(p_righe uuid[])
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
    if v_r.articolo_id is null then
      raise exception 'ordini_righe % ha articolo_id NULL', v_r.id;
    end if;
    if coalesce(v_r.scatole,0) <= 0 then
      raise exception 'ordini_righe % ha scatole <= 0', v_r.id;
    end if;

    -- pz_per_scatola (fallback 1 se colonna non esiste)
    begin
      execute 'select coalesce(pz_per_scatola,1)::int from public.articoli where id = '
      into v_pz_per_scatola
      using v_r.articolo_id;
    exception when undefined_column then
      v_pz_per_scatola := 1;
    end;

    v_pz := (v_r.scatole::int) * (v_pz_per_scatola::int);

    -- lock articolo
    perform 1 from public.articoli where id = v_r.articolo_id for update;

    -- scarico magazzino + scatole_inventario SEMPRE
    -- e contemporaneamente tolgo l'impegno (se c'e) senza andare sotto zero
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
$function$

