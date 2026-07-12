-- Vincula cada cita a su expediente por UUID (patient_id), usando el teléfono.
-- La app ya repara nombres por teléfono; esto evita que vuelvan a desincronizarse.
--
-- GDL usa columna patients."Phone" (mayúscula).
-- TX (Shenandoah) usa patients.phone (minúscula) — ver bloque al final.

-- ─── 1) Columna e índice (GDL y TX) ───────────────────────────────────────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS patient_id uuid REFERENCES patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments (patient_id);

COMMENT ON COLUMN appointments.patient_id IS
  'Expediente vinculado; appointments.patient sigue siendo el nombre en la cita.';

-- ─── 2) Rellenar patient_id — GUADALAJARA (GDL) ───────────────────────────
-- Ejecuta SOLO este UPDATE en el proyecto Supabase de GDL:

UPDATE appointments a
SET patient_id = p.id
FROM patients p
WHERE a.patient_id IS NULL
  AND length(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g')) >= 10
  AND right(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g'), 10)
    = right(regexp_replace(coalesce(p."Phone", ''), '\D', '', 'g'), 10);

-- Ver cuántas citas quedaron vinculadas:
-- SELECT count(*) FROM appointments WHERE patient_id IS NOT NULL;

-- ─── 3) Rellenar patient_id — HOUSTON / TX (otra BD) ──────────────────────
-- Solo en Supabase Shenandoah, si la columna es phone (minúscula):
--
-- UPDATE appointments a
-- SET patient_id = p.id
-- FROM patients p
-- WHERE a.patient_id IS NULL
--   AND length(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g')) >= 10
--   AND right(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g'), 10)
--     = right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10);
