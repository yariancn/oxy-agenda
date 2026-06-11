-- Teléfono y preferencia de alertas por empleado (users_staff)
-- Ejecutar en Supabase GDL y TX por separado.

ALTER TABLE users_staff
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS notify_on_booking boolean DEFAULT true;

COMMENT ON COLUMN users_staff.phone IS 'Celular del empleado (10 dígitos). SMS/WhatsApp de alertas de cita nueva.';
COMMENT ON COLUMN users_staff.notify_on_booking IS 'Si true, recibe alertas de cita nueva cuando tiene teléfono o correo.';
