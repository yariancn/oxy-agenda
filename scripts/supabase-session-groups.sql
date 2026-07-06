-- Carteras compartidas (grupo de sesiones con titular)
-- Ejecutar en Supabase GDL y TX

CREATE TABLE IF NOT EXISTS session_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  titular_patient_id uuid NOT NULL,
  wallets jsonb NOT NULL DEFAULT '{}',
  adeudo integer NOT NULL DEFAULT 0,
  package_history jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS session_group_id uuid REFERENCES session_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patients_session_group_id ON patients (session_group_id);
CREATE INDEX IF NOT EXISTS idx_session_groups_titular ON session_groups (titular_patient_id);

COMMENT ON TABLE session_groups IS 'Pool de sesiones pagadas compartidas entre titular y beneficiarios.';
COMMENT ON COLUMN patients.session_group_id IS 'Grupo de sesiones compartidas (máximo uno por paciente).';
