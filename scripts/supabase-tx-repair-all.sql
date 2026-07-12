-- OXY Agenda — Houston / Shenandoah (TX).
-- Ejecutar UNA vez en el SQL Editor del proyecto Supabase TX (NO en GDL).
-- Para Guadalajara usa scripts/supabase-gdl-repair-all.sql en la BD GDL.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS patient_id uuid REFERENCES patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments (patient_id);

UPDATE appointments a
SET patient_id = p.id
FROM patients p
WHERE a.patient_id IS NULL
  AND length(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g')) >= 10
  AND right(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g'), 10)
    = right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10);

UPDATE appointments a
SET patient = p.name
FROM patients p
WHERE a.patient_id = p.id
  AND length(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g')) >= 10
  AND right(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g'), 10)
    = right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10)
  AND lower(trim(coalesce(a.patient, ''))) <> lower(trim(coalesce(p.name, '')));

UPDATE appointments a
SET patient = p.name
FROM patients p
WHERE a.patient_id IS NULL
  AND length(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g')) >= 10
  AND right(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g'), 10)
    = right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10)
  AND lower(trim(coalesce(a.patient, ''))) <> lower(trim(coalesce(p.name, '')));

UPDATE patients
SET notes = NULLIF(trim(regexp_replace(coalesce(notes, ''), '(^|\n|\s·\s*)import-setmore[^·\n]*', '', 'gi')), '')
WHERE coalesce(notes, '') ILIKE '%import-setmore%'
   OR coalesce(notes, '') ILIKE '%setmore:%'
   OR coalesce(notes, '') ILIKE '%importar%setmore%';

UPDATE appointments
SET notes = NULLIF(trim(regexp_replace(coalesce(notes, ''), '(^|\n|\s·\s*)import-setmore[^·\n]*', '', 'gi')), '')
WHERE coalesce(notes, '') ILIKE '%import-setmore%'
   OR coalesce(notes, '') ILIKE '%setmore:%';

ALTER TABLE users_staff
  ALTER COLUMN notify_on_booking SET DEFAULT false;

UPDATE users_staff
SET notify_on_booking = false
WHERE notify_on_booking IS DISTINCT FROM false;
