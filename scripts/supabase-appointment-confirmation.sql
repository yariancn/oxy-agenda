-- SMS confirmation (run on BOTH Supabase TX / Shenandoah AND GDL)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS confirmation_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_reply text,
  ADD COLUMN IF NOT EXISTS confirmation_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmation_code text;

ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS confirmation_sms_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmation_hours_before integer DEFAULT 6,
  ADD COLUMN IF NOT EXISTS confirmation_no_reply_hours integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS confirmation_sms_body text;

COMMENT ON COLUMN appointments.confirmation_status IS 'none | pending | confirmed | declined | no_response_likely';
COMMENT ON COLUMN appointments.confirmation_enabled IS 'Staff opt-in: show/send SI/NO confirmation for this appointment';
COMMENT ON COLUMN appointments.confirmation_code IS 'Short code for SMS links /c/{code}/si|/no';
COMMENT ON COLUMN company_config.confirmation_sms_enabled IS 'Clinic-wide switch for confirmation SMS feature (Houston + GDL)';

CREATE UNIQUE INDEX IF NOT EXISTS appointments_confirmation_code_uidx
  ON appointments (confirmation_code)
  WHERE confirmation_code IS NOT NULL AND confirmation_code <> '';

-- Keep confirmation UI for appointments already in the flow
UPDATE appointments
SET confirmation_enabled = true
WHERE confirmation_enabled IS DISTINCT FROM true
  AND confirmation_status IS NOT NULL
  AND confirmation_status <> 'none'
  AND confirmation_status <> '';

-- Enable automatic first-visit confirmation SMS for GDL (6h before / ~5 min if booked inside window)
UPDATE company_config
SET
  confirmation_sms_enabled = true,
  confirmation_hours_before = COALESCE(confirmation_hours_before, 6),
  confirmation_sms_body = E'Hola {{nombre}}, confirma tu sesión {{cuando}} {{hora}} en OXYGENGDL.\n\n👉 Da click:\n\n✅ SI → {{si_url}}\n\n❌ NO → {{no_url}}\n\nDudas {{telefono}}'
WHERE clinic IN ('Oxygengdl', 'Guadalajara');

