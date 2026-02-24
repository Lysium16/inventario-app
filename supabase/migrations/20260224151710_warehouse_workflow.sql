-- Warehouse workflow: ordini -> impegnate -> completate
-- Idempotent migration (UTF-8 no BOM)

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ordini' AND column_name='stato'
  ) THEN
    ALTER TABLE public.ordini ADD COLUMN stato text NOT NULL DEFAULT 'CREATO';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ordini' AND column_name='confirmed_at'
  ) THEN
    ALTER TABLE public.ordini ADD COLUMN confirmed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ordini' AND column_name='completed_at'
  ) THEN
    ALTER TABLE public.ordini ADD COLUMN completed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ordini_righe' AND column_name='stato'
  ) THEN
    ALTER TABLE public.ordini_righe ADD COLUMN stato text NOT NULL DEFAULT 'CREATO';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ordini_righe' AND column_name='completed_at'
  ) THEN
    ALTER TABLE public.ordini_righe ADD COLUMN completed_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='articoli' AND column_name='magazzino'
  ) THEN
    ALTER TABLE public.articoli ADD COLUMN magazzino integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='articoli' AND column_name='impegnate'
  ) THEN
    ALTER TABLE public.articoli ADD COLUMN impegnate integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='articoli' AND column_name='in_arrivo'
  ) THEN
    ALTER TABLE public.articoli ADD COLUMN in_arrivo integer NOT NULL DEFAULT 0;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.confirm_order(p_ordine_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.ordini
    SET stato = 'IMPEGNATO',
        confirmed_at = COALESCE(confirmed_at, now())
  WHERE id = p_ordine_id;

  UPDATE public.ordini_righe
    SET stato = 'IMPEGNATO'
  WHERE ordine_id = p_ordine_id;

  UPDATE public.articoli a
  SET impegnate = a.impegnate + s.scatole
  FROM (
    SELECT articolo_id, SUM(scatole)::int AS scatole
    FROM public.ordini_righe
    WHERE ordine_id = p_ordine_id
    GROUP BY articolo_id
  ) s
  WHERE a.id = s.articolo_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_order_lines(p_righe uuid[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  oid uuid;
BEGIN
  IF p_righe IS NULL OR array_length(p_righe, 1) IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.articoli a
  SET magazzino = GREATEST(0, a.magazzino - s.scatole),
      impegnate = GREATEST(0, a.impegnate - s.scatole)
  FROM (
    SELECT articolo_id, SUM(scatole)::int AS scatole
    FROM public.ordini_righe
    WHERE id = ANY(p_righe)
    GROUP BY articolo_id
  ) s
  WHERE a.id = s.articolo_id;

  UPDATE public.ordini_righe
  SET stato = 'COMPLETATO',
      completed_at = now()
  WHERE id = ANY(p_righe);

  FOR oid IN
    SELECT DISTINCT ordine_id FROM public.ordini_righe WHERE id = ANY(p_righe)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.ordini_righe
      WHERE ordine_id = oid AND stato <> 'COMPLETATO'
    ) THEN
      UPDATE public.ordini
      SET stato = 'COMPLETATO',
          completed_at = now()
      WHERE id = oid;
    END IF;
  END LOOP;
END;
$$;