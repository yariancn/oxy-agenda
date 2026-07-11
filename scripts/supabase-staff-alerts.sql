-- Alertas al staff cuando hay cita nueva (portal público o agenda)
-- Ejecutar en Supabase GDL y TX

ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS notify_staff_on_booking boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_alert_first_sessions_only boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_alert_phones text,
  ADD COLUMN IF NOT EXISTS staff_alert_emails text;

COMMENT ON COLUMN company_config.staff_alert_phones IS 'Teléfonos staff (10 dígitos), separados por coma o salto de línea. SMS vía Twilio.';
COMMENT ON COLUMN company_config.staff_alert_emails IS 'Correos del equipo, separados por coma. Alerta vía Resend.';
COMMENT ON COLUMN company_config.staff_alert_first_sessions_only IS 'Si true, alertas de cita nueva solo para primeras sesiones (paciente nuevo o primera vez en el equipo).';
