-- Soft delete clienti: attivo
ALTER TABLE IF EXISTS public.clienti
  ADD COLUMN IF NOT EXISTS attivo boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS clienti_attivo_idx ON public.clienti(attivo);