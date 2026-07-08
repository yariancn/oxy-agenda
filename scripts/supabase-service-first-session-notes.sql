-- Notas propias por equipo (override de las indicaciones generales)
-- Ejecutar en Supabase GDL y TX según corresponda.

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS first_session_notes text,
  ADD COLUMN IF NOT EXISTS use_custom_notes boolean DEFAULT false;

COMMENT ON COLUMN services.first_session_notes IS 'Notas propias del equipo. Solo se usan si use_custom_notes = true; de lo contrario aplica company_config.notify_session_default.';
COMMENT ON COLUMN services.use_custom_notes IS 'Si true, este equipo usa first_session_notes como indicaciones principales en lugar de las generales (ej. Red Light).';
