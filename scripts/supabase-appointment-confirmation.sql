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

-- GDL defaults: 18h before, Spanish body with {{cuando}} = hoy|mañana
UPDATE company_config
SET
  confirmation_hours_before = COALESCE(confirmation_hours_before, 18),
  confirmation_sms_body = COALESCE(
    NULLIF(TRIM(confirmation_sms_body), ''),
    E'Hola {{nombre}}, este mensaje es para confirmar tu sesión hiperbárica {{cuando}} a las {{hora}} en OXYGENGDL (primera sesión).\nAgradeceremos respondas a la brevedad con SI o NO?\nTu confirmación nos ayuda a reservar tu espacio con tranquilidad; si no recibimos respuesta, podríamos liberar el horario para quien esté en lista de espera.\nDudas: 33 2166 4083'
  )
WHERE clinic IN ('Oxygengdl', 'Guadalajara')
  AND (confirmation_hours_before IS NULL OR confirmation_hours_before = 6 OR confirmation_sms_body IS NULL OR TRIM(confirmation_sms_body) = '');
