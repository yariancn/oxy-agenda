-- Plantillas de correo por clínica (ejecutar en Supabase GDL y TX)
-- Cada base tiene su propio company_config; el contenido es independiente por clínica.

ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS notify_subject_first text,
  ADD COLUMN IF NOT EXISTS notify_body_first text,
  ADD COLUMN IF NOT EXISTS notify_subject_booking text,
  ADD COLUMN IF NOT EXISTS notify_body_booking text,
  ADD COLUMN IF NOT EXISTS notify_subject_reschedule text,
  ADD COLUMN IF NOT EXISTS notify_body_reschedule text,
  ADD COLUMN IF NOT EXISTS notify_subject_cancel text,
  ADD COLUMN IF NOT EXISTS notify_body_cancel text,
  ADD COLUMN IF NOT EXISTS notify_extra_info text;

COMMENT ON COLUMN company_config.notify_body_first IS 'Cuerpo primera cita. Placeholders: {{nombre}} {{fecha}} {{hora}} {{servicio}} {{clinica}} {{direccion}} {{telefono}} {{instrucciones}}';
COMMENT ON COLUMN company_config.notify_extra_info IS 'Datos relevantes incluidos en todos los correos (estacionamiento, qué traer, etc.)';
