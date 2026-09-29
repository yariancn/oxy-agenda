-- SMS confirmation for first sessions (run on BOTH Supabase TX / Shenandoah AND GDL)
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
COMMENT ON COLUMN company_config.confirmation_sms_enabled IS 'SMS YES/NO (SI/NO) confirmation for first sessions only (Houston + GDL)';

-- GDL/Houston defaults: 6h before; Spanish body with one-tap SI/NO links
UPDATE company_config
SET
  confirmation_hours_before = 6,
  confirmation_sms_body = COALESCE(
    NULLIF(TRIM(confirmation_sms_body), ''),
    E'Hola {{nombre}}, confirma tu sesión {{cuando}} {{hora}} OXYGENGDL.\nSI: {{si_url}}\nNO: {{no_url}}\nDudas {{telefono}}'
  )
WHERE clinic IN ('Oxygengdl', 'Guadalajara');
