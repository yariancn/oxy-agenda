-- Sincronización en vivo con Google Calendar API (OAuth).
-- Ejecutar en Supabase GDL y TX.

ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS google_calendar_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_calendar_refresh_token text,
  ADD COLUMN IF NOT EXISTS google_calendar_id text DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS google_calendar_email text;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS google_calendar_event_id text;

COMMENT ON COLUMN company_config.google_calendar_refresh_token IS 'OAuth refresh token (servidor). No exponer al cliente.';
COMMENT ON COLUMN company_config.google_calendar_id IS 'ID del calendario de Google (default primary).';
COMMENT ON COLUMN appointments.google_calendar_event_id IS 'ID del evento en Google Calendar para actualizar/eliminar en vivo.';
