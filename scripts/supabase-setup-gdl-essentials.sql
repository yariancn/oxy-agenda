-- OXY Agenda — TODO lo esencial para GUADALAJARA (GDL 1 + GDL 2)
-- Ejecutar UNA VEZ en Supabase GDL → SQL Editor → Run
-- Seguro re-ejecutar: usa IF NOT EXISTS / ON CONFLICT DO NOTHING

-- ─── 1) Config admin completa ───────────────────────────────────────────────
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
  ADD COLUMN IF NOT EXISTS reminder_hours integer DEFAULT 24,
  ADD COLUMN IF NOT EXISTS notify_subject_first text,
  ADD COLUMN IF NOT EXISTS notify_body_first text,
  ADD COLUMN IF NOT EXISTS notify_subject_booking text,
  ADD COLUMN IF NOT EXISTS notify_body_booking text,
  ADD COLUMN IF NOT EXISTS notify_subject_reschedule text,
  ADD COLUMN IF NOT EXISTS notify_body_reschedule text,
  ADD COLUMN IF NOT EXISTS notify_subject_cancel text,
  ADD COLUMN IF NOT EXISTS notify_body_cancel text,
  ADD COLUMN IF NOT EXISTS notify_extra_info text,
  ADD COLUMN IF NOT EXISTS notify_session_label text,
  ADD COLUMN IF NOT EXISTS notify_session_default text,
  ADD COLUMN IF NOT EXISTS notify_session_url text,
  ADD COLUMN IF NOT EXISTS google_calendar_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_calendar_refresh_token text,
  ADD COLUMN IF NOT EXISTS google_calendar_id text DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS google_calendar_email text;
  ADD COLUMN IF NOT EXISTS notify_auto_first boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_auto_booking boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_auto_reschedule boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_auto_cancel boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_channel_email boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_channel_sms boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_sms_first text,
  ADD COLUMN IF NOT EXISTS notify_sms_booking text,
  ADD COLUMN IF NOT EXISTS notify_sms_reschedule text,
  ADD COLUMN IF NOT EXISTS notify_sms_cancel text,
  ADD COLUMN IF NOT EXISTS notify_staff_on_booking boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_alert_phones text,
  ADD COLUMN IF NOT EXISTS staff_alert_emails text,
  ADD COLUMN IF NOT EXISTS weekly_schedule jsonb,
  ADD COLUMN IF NOT EXISTS calendar_feed_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS calendar_feed_token text,
  ADD COLUMN IF NOT EXISTS demo_occupancy_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_occupancy_percent integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS demo_occupancy_slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS demo_occupancy_overrides jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ─── 2) Dos sedes GDL (Oxygengdl + Oxygengdl2) ───────────────────────────
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS clinic text DEFAULT 'Oxygengdl';
ALTER TABLE services ADD COLUMN IF NOT EXISTS clinic text DEFAULT 'Oxygengdl';
ALTER TABLE blocked_slots ADD COLUMN IF NOT EXISTS clinic text DEFAULT 'Oxygengdl';

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_date ON appointments (clinic, full_date);
CREATE INDEX IF NOT EXISTS idx_services_clinic ON services (clinic);
CREATE INDEX IF NOT EXISTS idx_blocked_slots_clinic_date ON blocked_slots (clinic, date);

UPDATE company_config SET clinic = 'Oxygengdl' WHERE clinic IS NULL OR clinic = 'Guadalajara';
UPDATE appointments SET clinic = 'Oxygengdl' WHERE clinic IS NULL OR clinic = 'Guadalajara';
UPDATE services SET clinic = 'Oxygengdl' WHERE clinic IS NULL OR clinic = 'Guadalajara';
UPDATE blocked_slots SET clinic = 'Oxygengdl' WHERE clinic IS NULL OR clinic = 'Guadalajara';

INSERT INTO company_config (
  clinic, name, address, maps_url, phone, ticket_message,
  start_time, end_time, interval_mins, booking_limit_hours, cancel_limit_hours,
  master_pin, financial_pin, notify_on_booking, reminder_hours, weekly_schedule,
  calendar_feed_enabled, notify_auto_first, notify_auto_booking,
  notify_auto_reschedule, notify_auto_cancel, notify_channel_email, notify_channel_sms
)
SELECT
  'Oxygengdl2', 'OXYGENDGL2', address, maps_url, phone, ticket_message,
  start_time, end_time, interval_mins, booking_limit_hours, cancel_limit_hours,
  master_pin, financial_pin, notify_on_booking, reminder_hours, weekly_schedule,
  false, notify_auto_first, notify_auto_booking,
  notify_auto_reschedule, notify_auto_cancel, notify_channel_email, notify_channel_sms
FROM company_config
WHERE clinic = 'Oxygengdl'
  AND NOT EXISTS (SELECT 1 FROM company_config c2 WHERE c2.clinic = 'Oxygengdl2');

INSERT INTO services (name, duration, buffer, price, color, is_active, start_time, end_time, clinic)
SELECT s.name, s.duration, s.buffer, s.price, s.color, s.is_active, s.start_time, s.end_time, 'Oxygengdl2'
FROM services s
WHERE (s.clinic = 'Oxygengdl' OR s.clinic IS NULL OR s.clinic = 'Guadalajara')
  AND NOT EXISTS (
    SELECT 1 FROM services s2
    WHERE s2.clinic = 'Oxygengdl2' AND lower(trim(s2.name)) = lower(trim(s.name))
  );

-- ─── 3) Login staff + perfil empleado ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_login_attempts (
  email_key text PRIMARY KEY,
  fail_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_login_attempts_locked_until
  ON staff_login_attempts (locked_until) WHERE locked_until IS NOT NULL;

ALTER TABLE users_staff
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS notify_on_booking boolean DEFAULT true;

-- ─── 4) Servicios y citas ─────────────────────────────────────────────────
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS start_time text,
  ADD COLUMN IF NOT EXISTS end_time text,
  ADD COLUMN IF NOT EXISTS first_session_notes text,
  ADD COLUMN IF NOT EXISTS use_custom_notes boolean DEFAULT false;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS outside_normal_hours boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_extended_block boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoter_code text,
  ADD COLUMN IF NOT EXISTS google_calendar_event_id text;

-- ─── 5) Carteras compartidas ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  titular_patient_id uuid NOT NULL,
  wallets jsonb NOT NULL DEFAULT '{}',
  adeudo integer NOT NULL DEFAULT 0,
  package_history jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS session_group_id uuid REFERENCES session_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_patients_session_group_id ON patients (session_group_id);
CREATE INDEX IF NOT EXISTS idx_session_groups_titular ON session_groups (titular_patient_id);

-- ─── 6) Promotores ────────────────────────────────────────────────────────
ALTER TABLE promoters
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS calendar_feed_token text;

-- ─── 7) Seguridad RLS (recomendado en producción) ─────────────────────────
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'patients', 'appointments', 'services', 'users_staff', 'blocked_slots',
    'company_config', 'protocols', 'user_roles', 'promoters', 'audit_logs'
  ]
  LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
