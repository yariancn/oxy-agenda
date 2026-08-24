-- Bloqueo de pacientes: bandera + motivo obligatorio en app.
-- Ejecutar en Supabase GDL y TX (SQL Editor).

ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS block_reason text DEFAULT '';

COMMENT ON COLUMN patients.is_blocked IS 'Si true, no se puede agendar ni cobrar al paciente';
COMMENT ON COLUMN patients.block_reason IS 'Motivo del bloqueo (requerido por la app al bloquear)';

CREATE INDEX IF NOT EXISTS idx_patients_is_blocked ON patients (is_blocked) WHERE is_blocked = true;
