-- Las alertas de cita nueva van primero a company_config.staff_alert_phones (teléfono de clínica).
-- Cada empleado solo recibe alertas en su celular/correo si notify_on_booking = true.
-- Ejecutar en Supabase GDL y TX para corregir empleados que quedaron con el default antiguo (true).

ALTER TABLE users_staff
  ALTER COLUMN notify_on_booking SET DEFAULT false;

COMMENT ON COLUMN users_staff.notify_on_booking IS
  'Si true, el empleado recibe alertas de cita nueva en su teléfono/correo. El teléfono de clínica (staff_alert_phones) es independiente.';

UPDATE users_staff
SET notify_on_booking = false
WHERE notify_on_booking IS DISTINCT FROM false;
