-- Notas de primera sesión propias por equipo (override de las generales)
-- Se envían solo en la primera cita del paciente en la clínica (paciente nuevo).
-- Ejecutar en Supabase GDL y TX según corresponda.

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS first_session_notes text,
  ADD COLUMN IF NOT EXISTS use_custom_notes boolean DEFAULT false;

COMMENT ON COLUMN services.first_session_notes IS 'Notas de primera sesión propias del equipo. Solo se usan si use_custom_notes = true; de lo contrario aplica company_config.notify_session_default.';
COMMENT ON COLUMN services.use_custom_notes IS 'Si true, este equipo usa first_session_notes como notas de primera sesión en lugar de las generales (ej. Red Light).';
