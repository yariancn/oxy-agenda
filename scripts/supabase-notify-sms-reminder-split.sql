-- SMS recordatorios vs programación + defaults de clínica.
-- Ejecutar en GDL y TX (SQL Editor de cada proyecto Supabase).

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS prefers_sms_reminder boolean DEFAULT true;

ALTER TABLE patients
  ALTER COLUMN prefers_sms_reminder SET DEFAULT true;

UPDATE patients
SET prefers_sms_reminder = true
WHERE prefers_sms_reminder IS NULL;

-- Clínica: habilitar SMS por evento + recordatorio automático
UPDATE company_config
SET
  notify_channel_email = COALESCE(notify_channel_email, true),
  notify_channel_sms = COALESCE(notify_channel_sms, true),
  notify_auto_first = COALESCE(notify_auto_first, true),
  notify_auto_booking = COALESCE(notify_auto_booking, true),
  notify_auto_reschedule = COALESCE(notify_auto_reschedule, true),
  notify_auto_cancel = COALESCE(notify_auto_cancel, true),
  notify_auto_reminder = true,
  notify_use_email_first = COALESCE(notify_use_email_first, true),
  notify_use_sms_first = COALESCE(notify_use_sms_first, true),
  notify_use_email_booking = COALESCE(notify_use_email_booking, true),
  notify_use_sms_booking = true,
  notify_use_email_reschedule = COALESCE(notify_use_email_reschedule, true),
  notify_use_sms_reschedule = true,
  notify_use_email_cancel = COALESCE(notify_use_email_cancel, true),
  notify_use_sms_cancel = true,
  notify_use_email_reminder = COALESCE(notify_use_email_reminder, true),
  notify_use_sms_reminder = true
WHERE true;
