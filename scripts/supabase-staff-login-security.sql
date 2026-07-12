-- OXY Agenda: login staff (correo + NIP), dispositivo confiable y perfil de empleado
-- Ejecutar UNA VEZ en Supabase GDL y TX por separado.

-- Rate limit de intentos fallidos (solo en GDL es suficiente; el código usa GDL para ambas regiones)
CREATE TABLE IF NOT EXISTS staff_login_attempts (
  email_key text PRIMARY KEY,
  fail_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_login_attempts_locked_until
  ON staff_login_attempts (locked_until)
  WHERE locked_until IS NOT NULL;

COMMENT ON TABLE staff_login_attempts IS 'Bloqueo temporal tras 5 intentos fallidos de login staff (15 min).';

-- Columnas de perfil en users_staff (correo, teléfono, alertas)
ALTER TABLE users_staff
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS notify_on_booking boolean DEFAULT false;

COMMENT ON COLUMN users_staff.email IS 'Correo institucional único para login staff.';
COMMENT ON COLUMN users_staff.phone IS 'Celular del empleado (10 dígitos). SMS/WhatsApp solo si notify_on_booking = true.';
COMMENT ON COLUMN users_staff.notify_on_booking IS 'Si true, recibe alertas de cita nueva en su teléfono/correo. El teléfono de clínica (staff_alert_phones) es independiente.';
