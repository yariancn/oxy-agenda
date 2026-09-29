-- SMS confirmation (run on BOTH Supabase TX / Shenandoah AND GDL)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS confirmation_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_reply text,
  ADD COLUMN IF NOT EXISTS confirmation_enabled boolean DEFAULT false;

ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS confirmation_sms_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmation_hours_before integer DEFAULT 6,
  ADD COLUMN IF NOT EXISTS confirmation_no_reply_hours integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS confirmation_sms_body text;

COMMENT ON COLUMN appointments.confirmation_status IS 'none | pending | confirmed | declined | no_response_likely';
COMMENT ON COLUMN appointments.confirmation_enabled IS 'Staff opt-in: show/send SI/NO confirmation for this appointment';
COMMENT ON COLUMN company_config.confirmation_sms_enabled IS 'Clinic-wide switch for confirmation SMS feature (Houston + GDL)';

-- Keep confirmation UI for appointments already in the flow
UPDATE appointments
SET confirmation_enabled = true
WHERE confirmation_enabled IS DISTINCT FROM true
  AND confirmation_status IS NOT NULL
  AND confirmation_status <> 'none'
  AND confirmation_status <> '';

-- Force GDL confirmation body to one-tap links (old “responde SI/NO” bodies cannot receive SMS replies)
UPDATE company_config
SET
  confirmation_hours_before = COALESCE(confirmation_hours_before, 6),
  confirmation_sms_body = E'Hola {{nombre}}, confirma tu sesión {{cuando}} {{hora}} OXYGENGDL.\nSI: {{si_url}}\nNO: {{no_url}}\nDudas {{telefono}}'
WHERE clinic IN ('Oxygengdl', 'Guadalajara')
  AND (
    confirmation_sms_body IS NULL
    OR TRIM(confirmation_sms_body) = ''
    OR confirmation_sms_body NOT ILIKE '%{{si_url}}%'
  );
