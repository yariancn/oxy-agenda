-- OXY Agenda: intentos fallidos de login staff (correo + NIP)
-- Ejecutar UNA VEZ en Supabase GDL (compartido para rate limit de ambas regiones).

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
