-- OXY Agenda — TODO lo esencial para HOUSTON / SHENANDOAH (TX)
-- Ejecutar UNA VEZ en Supabase TX → SQL Editor → Run
-- Seguro re-ejecutar: usa IF NOT EXISTS
-- NO incluye sedes GDL (Oxygengdl2) — eso es solo Guadalajara.

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

UPDATE company_config SET clinic = 'Shenandoah' WHERE clinic IS NULL;

-- ─── 2) Login staff + perfil empleado ─────────────────────────────────────
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

-- ─── 3) Servicios y citas ─────────────────────────────────────────────────
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

-- Opcional en TX: columna clinic (la app funciona sin ella; útil si migras datos)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS clinic text DEFAULT 'Shenandoah';
ALTER TABLE services ADD COLUMN IF NOT EXISTS clinic text DEFAULT 'Shenandoah';
ALTER TABLE blocked_slots ADD COLUMN IF NOT EXISTS clinic text DEFAULT 'Shenandoah';

-- ─── 4) Carteras compartidas ──────────────────────────────────────────────
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
  ADD COLUMN IF NOT EXISTS session_group_id uuid REFERENCES session_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS block_reason text DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_patients_session_group_id ON patients (session_group_id);
CREATE INDEX IF NOT EXISTS idx_patients_is_blocked ON patients (is_blocked) WHERE is_blocked = true;
CREATE INDEX IF NOT EXISTS idx_session_groups_titular ON session_groups (titular_patient_id);

-- ─── 5) Promotores ────────────────────────────────────────────────────────
ALTER TABLE promoters
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS calendar_feed_token text;

-- ─── 6) Seguridad RLS (recomendado en producción) ─────────────────────────
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
