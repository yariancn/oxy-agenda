-- Columnas nuevas para Mensajes (canales Correo/SMS por tipo + recordatorio).
-- Ejecutar en Supabase SQL Editor: GDL y Houston (TX).

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

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
