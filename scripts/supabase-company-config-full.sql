-- OXY Agenda: company_config completo (horarios, correos, notificaciones)
-- Ejecutar UNA VEZ en Supabase GDL y UNA VEZ en Supabase TX (Shenandoah)
-- SQL Editor → New query → pegar todo → Run

-- 1) Config general
ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS clinic text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS ticket_message text,
  ADD COLUMN IF NOT EXISTS start_time text DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS end_time text DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS interval_mins integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS booking_limit_hours integer DEFAULT 2,
  ADD COLUMN IF NOT EXISTS cancel_limit_hours integer DEFAULT 24,
  ADD COLUMN IF NOT EXISTS master_pin text DEFAULT '000000',
  ADD COLUMN IF NOT EXISTS financial_pin text DEFAULT '123456',
  ADD COLUMN IF NOT EXISTS notify_on_booking boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_hours integer DEFAULT 24;

-- 2) Plantillas de correo
ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS notify_subject_first text,
  ADD COLUMN IF NOT EXISTS notify_body_first text,
  ADD COLUMN IF NOT EXISTS notify_subject_booking text,
  ADD COLUMN IF NOT EXISTS notify_body_booking text,
  ADD COLUMN IF NOT EXISTS notify_subject_reschedule text,
  ADD COLUMN IF NOT EXISTS notify_body_reschedule text,
  ADD COLUMN IF NOT EXISTS notify_subject_cancel text,
  ADD COLUMN IF NOT EXISTS notify_body_cancel text,
  ADD COLUMN IF NOT EXISTS notify_extra_info text;

-- 3) Indicaciones de sesión y toggles por tipo
ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS notify_session_label text,
  ADD COLUMN IF NOT EXISTS notify_session_default text,
  ADD COLUMN IF NOT EXISTS notify_auto_first boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_auto_booking boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_auto_reschedule boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_auto_cancel boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_channel_email boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_channel_sms boolean DEFAULT true;

-- 4) Alertas al staff (cita nueva)
ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS notify_staff_on_booking boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_alert_phones text,
  ADD COLUMN IF NOT EXISTS staff_alert_emails text;

-- Valores por defecto en filas existentes (opcional; omitir si Supabase advierte UPDATE sin WHERE)
UPDATE company_config
SET
  start_time = COALESCE(start_time, '07:00'),
  end_time = COALESCE(end_time, '20:00'),
  interval_mins = COALESCE(interval_mins, 30),
  booking_limit_hours = COALESCE(booking_limit_hours, 2),
  cancel_limit_hours = COALESCE(cancel_limit_hours, 24),
  master_pin = COALESCE(master_pin, '000000'),
  financial_pin = COALESCE(financial_pin, '123456'),
  notify_on_booking = COALESCE(notify_on_booking, true),
  reminder_hours = COALESCE(reminder_hours, 24),
  notify_auto_first = COALESCE(notify_auto_first, true),
  notify_auto_booking = COALESCE(notify_auto_booking, true),
  notify_auto_reschedule = COALESCE(notify_auto_reschedule, true),
  notify_auto_cancel = COALESCE(notify_auto_cancel, true),
  notify_channel_email = COALESCE(notify_channel_email, true),
  notify_channel_sms = COALESCE(notify_channel_sms, true);
