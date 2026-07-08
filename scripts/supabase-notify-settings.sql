-- Indicaciones de sesión editables y toggles por tipo de notificación
-- Ejecutar en Supabase GDL y TX

ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS notify_session_label text,
  ADD COLUMN IF NOT EXISTS notify_session_default text,
  ADD COLUMN IF NOT EXISTS notify_session_url text,
  ADD COLUMN IF NOT EXISTS notify_auto_first boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_auto_booking boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_auto_reschedule boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_auto_cancel boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_channel_email boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_channel_sms boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_sms_first text,
  ADD COLUMN IF NOT EXISTS notify_sms_booking text,
  ADD COLUMN IF NOT EXISTS notify_sms_reschedule text,
  ADD COLUMN IF NOT EXISTS notify_sms_cancel text;

COMMENT ON COLUMN company_config.notify_session_default IS 'Indicaciones estándar si la cita no tiene notas. Placeholder {{instrucciones}} en plantillas.';
COMMENT ON COLUMN company_config.notify_session_url IS 'Liga editable a la página de indicaciones; se envía por SMS en la primera cita. Default GDL: oxygengdl.com, Houston: oxyhyperbaric.com.';
COMMENT ON COLUMN company_config.notify_auto_first IS 'Enviar correo/SMS automático en primera cita';
