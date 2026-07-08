-- OXY Agenda: configuración Admin completa (una vez por clínica).
-- Ejecutar en Supabase SQL Editor → GDL y TX por separado.
-- Incluye: horarios, días laborables, Google Calendar feed, notificaciones, plantillas.

-- Horarios base y clínica
ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS clinic text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS maps_url text,
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

-- Días laborables y horario por día
ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS weekly_schedule jsonb;

-- Google Calendar / iCal feed
ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS calendar_feed_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS calendar_feed_token text;

-- Plantillas de correo
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

-- Notificaciones automáticas
ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS notify_session_label text,
  ADD COLUMN IF NOT EXISTS notify_session_default text,
  ADD COLUMN IF NOT EXISTS notify_session_url text,
  ADD COLUMN IF NOT EXISTS notify_auto_first boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_auto_booking boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_auto_reschedule boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_auto_cancel boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_channel_email boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_channel_sms boolean DEFAULT true;

-- Alertas staff
ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS notify_staff_on_booking boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_alert_phones text,
  ADD COLUMN IF NOT EXISTS staff_alert_emails text;

-- Promotores: token de calendario por persona
ALTER TABLE promoters
  ADD COLUMN IF NOT EXISTS calendar_feed_token text;

COMMENT ON COLUMN company_config.weekly_schedule IS 'Días laborables (mon..sun): open, custom_hours, start_time, end_time';
COMMENT ON COLUMN company_config.calendar_feed_enabled IS 'Feed iCal para Google Calendar';
COMMENT ON COLUMN company_config.calendar_feed_token IS 'Token URL /api/calendar/feed (clínica)';
COMMENT ON COLUMN promoters.calendar_feed_token IS 'Token URL /api/calendar/feed (solo ese promotor)';
