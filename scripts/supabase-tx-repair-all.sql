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

-- SMS confirmation (first session, Houston)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS confirmation_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_reply text;

ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS confirmation_sms_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmation_hours_before integer DEFAULT 6,
  ADD COLUMN IF NOT EXISTS confirmation_no_reply_hours integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS confirmation_sms_body text;

UPDATE company_config
SET confirmation_sms_enabled = true
WHERE clinic = 'Shenandoah'
  AND confirmation_sms_enabled IS DISTINCT FROM true;

-- Promoter email (no-show alerts)
ALTER TABLE promoters
  ADD COLUMN IF NOT EXISTS email text;

-- Appointment reminders
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS notify_auto_reminder boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_sms_reminder text,
  ADD COLUMN IF NOT EXISTS notify_subject_reminder text,
  ADD COLUMN IF NOT EXISTS notify_body_reminder text;
