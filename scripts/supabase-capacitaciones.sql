-- Capacitaciones / cursos de día completo (NO bloquean equipos ni ocupan columnas)
-- Ejecutar en Supabase GDL (y TX si aplica).

CREATE TABLE IF NOT EXISTS capacitaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic text NOT NULL DEFAULT 'Oxygengdl',
  full_date date NOT NULL,
  title text NOT NULL,
  start_time text NOT NULL DEFAULT '9:00 AM',
  end_time text NOT NULL DEFAULT '5:00 PM',
  location text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  -- [{ id, name, phone, email, confirmation_status, confirmation_sent_at, reminder_sent_at }]
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS capacitaciones_clinic_date_idx
  ON capacitaciones (clinic, full_date);

COMMENT ON TABLE capacitaciones IS 'Cursos/capacitaciones de día completo: visibles en agenda como franja, sin bloquear equipos.';
COMMENT ON COLUMN capacitaciones.attendees IS 'JSON array de asistentes con teléfono para confirmación/recordatorio SMS.';

-- Staff API uses service_role (bypasses RLS). Keep grants explicit for tooling/admin.
GRANT ALL ON TABLE capacitaciones TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE capacitaciones TO authenticated;
