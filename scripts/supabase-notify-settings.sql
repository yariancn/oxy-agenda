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
  ADD COLUMN IF NOT EXISTS notify_auto_reminder boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_channel_email boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_channel_sms boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_sms_first text,
  ADD COLUMN IF NOT EXISTS notify_sms_booking text,
  ADD COLUMN IF NOT EXISTS notify_sms_reschedule text,
  ADD COLUMN IF NOT EXISTS notify_sms_cancel text,
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

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

COMMENT ON COLUMN company_config.notify_session_default IS 'Indicaciones estándar si la cita no tiene notas. Placeholder {{instrucciones}} en plantillas.';
COMMENT ON COLUMN company_config.notify_session_url IS 'Liga editable a la página de indicaciones; se envía por SMS en la primera cita. Default GDL: oxygengdl.com, Houston: oxyhyperbaric.com.';
COMMENT ON COLUMN company_config.notify_auto_first IS 'Enviar correo/SMS automático en primera cita';
COMMENT ON COLUMN company_config.notify_auto_reminder IS 'Enviar recordatorio automático X horas antes (reminder_hours)';
COMMENT ON COLUMN appointments.reminder_sent_at IS 'Cuándo se envió el recordatorio automático';
