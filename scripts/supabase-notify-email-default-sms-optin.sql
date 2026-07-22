-- Default notifications: email for all events; SMS only on first visit unless patient opts in.
-- Run on EVERY clinic database (GDL + Houston/TX).

-- Optional marker (used by app auto-migration)
ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS notify_sms_opt_in_migrated_at timestamptz;

-- 1) All patients: SMS off (email stays as-is; typically on)
UPDATE patients
SET prefers_sms = false
WHERE prefers_sms IS DISTINCT FROM false;

-- Appointments copy of the flag (if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'prefers_sms'
  ) THEN
    UPDATE appointments
    SET prefers_sms = false
    WHERE prefers_sms IS DISTINCT FROM false;
  END IF;
END $$;

-- 2) Clinic Admin → Messages: non-first SMS defaults off; first stays email+SMS
UPDATE company_config
SET
  notify_use_email_first = COALESCE(notify_use_email_first, true),
  notify_use_sms_first = COALESCE(notify_use_sms_first, true),
  notify_use_email_booking = COALESCE(notify_use_email_booking, true),
  notify_use_sms_booking = false,
  notify_use_email_reschedule = COALESCE(notify_use_email_reschedule, true),
  notify_use_sms_reschedule = false,
  notify_use_email_cancel = COALESCE(notify_use_email_cancel, true),
  notify_use_sms_cancel = false,
  notify_use_email_reminder = COALESCE(notify_use_email_reminder, true),
  notify_use_sms_reminder = false,
  notify_sms_opt_in_migrated_at = COALESCE(notify_sms_opt_in_migrated_at, now());

-- Optional: ensure patient column default for new rows
ALTER TABLE patients
  ALTER COLUMN prefers_sms SET DEFAULT false;

SELECT
  (SELECT count(*) FROM patients WHERE prefers_sms = true) AS patients_still_sms_on,
  (SELECT count(*) FROM patients WHERE prefers_sms = false OR prefers_sms IS NULL) AS patients_sms_off;
