-- OXY Agenda — SOLO Guadalajara (proyecto Supabase GDL: yspysvrktdbyvduewlro).
-- NO es el de Houston. En el dashboard de Supabase abre el proyecto GDL → SQL Editor → Run.

-- 1) Canales Correo/SMS por tipo de aviso + recordatorio
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

-- 2) Verificación: debe devolver filas (sin error de "column does not exist")
SELECT
  notify_use_email_booking,
  notify_use_sms_booking,
  notify_use_email_reminder,
  notify_use_sms_reminder,
  notify_auto_reminder
FROM company_config
LIMIT 5;
