-- Indicaciones de primera sesión por equipo (SMS/correo cuando notifyType = first)
-- Ejecutar en Supabase GDL y TX según corresponda.

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS first_session_notes text;

COMMENT ON COLUMN services.first_session_notes IS 'Indicaciones solo en la primera cita del paciente con este equipo. Si vacío, usa company_config.notify_session_default.';
