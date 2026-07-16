-- OXY Agenda — Guadalajara (GDL). Ejecutar UNA vez en el SQL Editor de Supabase GDL.
-- NO ejecutar en Houston: usa scripts/supabase-tx-repair-all.sql en Supabase TX.
-- Cubre citas de Oxygengdl y Oxygengdl2 (misma BD); GDL2 está bloqueada en la app.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS patient_id uuid REFERENCES patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments (patient_id);

UPDATE appointments a
SET patient_id = p.id
FROM patients p
WHERE a.patient_id IS NULL
  AND length(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g')) >= 10
  AND right(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g'), 10)
    = right(regexp_replace(coalesce(p."Phone", ''), '\D', '', 'g'), 10);

UPDATE appointments a
SET patient = p."Name"
FROM patients p
WHERE a.patient_id = p.id
  AND length(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g')) >= 10
  AND right(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g'), 10)
    = right(regexp_replace(coalesce(p."Phone", ''), '\D', '', 'g'), 10)
  AND lower(trim(coalesce(a.patient, ''))) <> lower(trim(coalesce(p."Name", '')));

UPDATE appointments a
SET patient = p."Name"
FROM patients p
WHERE a.patient_id IS NULL
  AND length(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g')) >= 10
  AND right(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g'), 10)
    = right(regexp_replace(coalesce(p."Phone", ''), '\D', '', 'g'), 10)
  AND lower(trim(coalesce(a.patient, ''))) <> lower(trim(coalesce(p."Name", '')));

UPDATE patients
SET notes = NULLIF(trim(regexp_replace(coalesce(notes, ''), '(^|\n|\s·\s*)import-setmore-gdl[^·\n]*', '', 'gi')), '')
WHERE coalesce(notes, '') ILIKE '%import-setmore%'
   OR coalesce(notes, '') ILIKE '%setmore:%'
   OR coalesce(notes, '') ILIKE '%importar%setmore%';

UPDATE appointments
SET notes = NULLIF(trim(regexp_replace(coalesce(notes, ''), '(^|\n|\s·\s*)import-setmore-gdl[^·\n]*', '', 'gi')), '')
WHERE coalesce(notes, '') ILIKE '%import-setmore%'
   OR coalesce(notes, '') ILIKE '%setmore:%';

ALTER TABLE users_staff
  ALTER COLUMN notify_on_booking SET DEFAULT false;

UPDATE users_staff
SET notify_on_booking = false
WHERE notify_on_booking IS DISTINCT FROM false;

-- Appointment reminders
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS notify_auto_reminder boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_sms_reminder text,
  ADD COLUMN IF NOT EXISTS notify_subject_reminder text,
  ADD COLUMN IF NOT EXISTS notify_body_reminder text,
  ADD COLUMN IF NOT EXISTS notify_use_email_first boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_use_sms_first boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_use_email_booking boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_use_sms_booking boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_use_email_reschedule boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_use_sms_reschedule boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_use_email_cancel boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_use_sms_cancel boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_use_email_reminder boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_use_sms_reminder boolean DEFAULT true;

-- Live sync ping (open agenda screens)
ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS agenda_rev bigint NOT NULL DEFAULT 1;
