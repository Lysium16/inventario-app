-- Warehouse flow (definitivo): ordini_righe -> IMPEGNATO -> COMPLETATO
-- Idempotente. UTF-8 no BOM.

DO $$
BEGIN
  -- colonne su ordini
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ordini' AND column_name='stato'
  ) THEN
    ALTER TABLE public.ordini ADD COLUMN stato text NOT NULL DEFAULT 'IMPEGNATO';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ordini' AND column_name='created_at'
  ) THEN
    ALTER TABLE public.ordini ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ordini' AND column_name='completed_at'
  ) THEN
    ALTER TABLE public.ordini ADD COLUMN completed_at timestamptz;
  END IF;

  -- colonne su ordini_righe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ordini_righe' AND column_name='stato'
  ) THEN
    ALTER TABLE public.ordini_righe ADD COLUMN stato text NOT NULL DEFAULT 'IMPEGNATO';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ordini_righe' AND column_name='created_at'
  ) THEN
    ALTER TABLE public.ordini_righe ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ordini_righe' AND column_name='completed_at'
  ) THEN
    ALTER TABLE public.ordini_righe ADD COLUMN completed_at timestamptz;
  END IF;
END;
$$;

-- 1) INSERT righe: incrementa impegnate + forza stato IMPEGNATO
CREATE OR REPLACE FUNCTION public._ordini_righe_after_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- righe sempre IMPEGNATO all'inserimento
  IF NEW.stato IS NULL OR NEW.stato = '' THEN
    NEW.stato := 'IMPEGNATO';
  END IF;

  UPDATE public.articoli
  SET impegnate = COALESCE(impegnate,0) + COALESCE(NEW.scatole,0)
  WHERE id = NEW.articolo_id;

  -- anche l'ordine diventa IMPEGNATO (se non già COMPLETATO)
  UPDATE public.ordini
  SET stato = 'IMPEGNATO'
  WHERE id = NEW.ordine_id AND stato <> 'COMPLETATO';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ordini_righe_ai ON public.ordini_righe;
CREATE TRIGGER trg_ordini_righe_ai
AFTER INSERT ON public.ordini_righe
FOR EACH ROW
EXECUTE FUNCTION public._ordini_righe_after_insert();

-- 2) UPDATE righe: se cambia scatole/articolo_id mentre IMPEGNATO, aggiusta differenza
CREATE OR REPLACE FUNCTION public._ordini_righe_after_update_adjust()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_qty int;
  new_qty int;
BEGIN
  old_qty := COALESCE(OLD.scatole,0);
  new_qty := COALESCE(NEW.scatole,0);

  -- Solo se riga non è completata (altrimenti lo stock lo gestiamo con il trigger completamento)
  IF COALESCE(OLD.stato,'IMPEGNATO') <> 'COMPLETATO' AND COALESCE(NEW.stato,'IMPEGNATO') <> 'COMPLETATO' THEN
    -- se cambia articolo
    IF OLD.articolo_id IS DISTINCT FROM NEW.articolo_id THEN
      UPDATE public.articoli SET impegnate = GREATEST(0, COALESCE(impegnate,0) - old_qty) WHERE id = OLD.articolo_id;
      UPDATE public.articoli SET impegnate = COALESCE(impegnate,0) + new_qty WHERE id = NEW.articolo_id;
    ELSE
      -- stesso articolo: applica delta scatole
      UPDATE public.articoli
      SET impegnate = GREATEST(0, COALESCE(impegnate,0) + (new_qty - old_qty))
      WHERE id = NEW.articolo_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ordini_righe_au_adjust ON public.ordini_righe;
CREATE TRIGGER trg_ordini_righe_au_adjust
AFTER UPDATE OF scatole, articolo_id, stato ON public.ordini_righe
FOR EACH ROW
EXECUTE FUNCTION public._ordini_righe_after_update_adjust();

-- 3) DELETE righe: se era IMPEGNATO, scala impegnate
CREATE OR REPLACE FUNCTION public._ordini_righe_after_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(OLD.stato,'IMPEGNATO') <> 'COMPLETATO' THEN
    UPDATE public.articoli
    SET impegnate = GREATEST(0, COALESCE(impegnate,0) - COALESCE(OLD.scatole,0))
    WHERE id = OLD.articolo_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_ordini_righe_ad ON public.ordini_righe;
CREATE TRIGGER trg_ordini_righe_ad
AFTER DELETE ON public.ordini_righe
FOR EACH ROW
EXECUTE FUNCTION public._ordini_righe_after_delete();

-- 4) COMPLETAMENTO: quando stato passa a COMPLETATO -> scala magazzino e impegnate, set timestamp
CREATE OR REPLACE FUNCTION public._ordini_righe_after_complete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  remaining int;
BEGIN
  IF COALESCE(OLD.stato,'IMPEGNATO') <> 'COMPLETATO' AND NEW.stato = 'COMPLETATO' THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());

    UPDATE public.articoli
    SET magazzino = GREATEST(0, COALESCE(magazzino,0) - COALESCE(NEW.scatole,0)),
        impegnate = GREATEST(0, COALESCE(impegnate,0) - COALESCE(NEW.scatole,0))
    WHERE id = NEW.articolo_id;

    SELECT COUNT(*) INTO remaining
    FROM public.ordini_righe
    WHERE ordine_id = NEW.ordine_id AND COALESCE(stato,'IMPEGNATO') <> 'COMPLETATO';

    IF remaining = 0 THEN
      UPDATE public.ordini
      SET stato = 'COMPLETATO',
          completed_at = now()
      WHERE id = NEW.ordine_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ordini_righe_bu_complete ON public.ordini_righe;
CREATE TRIGGER trg_ordini_righe_bu_complete
BEFORE UPDATE OF stato ON public.ordini_righe
FOR EACH ROW
EXECUTE FUNCTION public._ordini_righe_after_complete();