-- Houston: SMS confirmation for first sessions (run on Supabase TX / Shenandoah)
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

COMMENT ON COLUMN appointments.confirmation_status IS 'none | pending | confirmed | declined | no_response_likely';
COMMENT ON COLUMN company_config.confirmation_sms_enabled IS 'Houston: SMS YES/NO confirmation for first sessions only';
