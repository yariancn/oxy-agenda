-- OXY Agenda: dos sedes GDL en la misma base (Oxygengdl + Oxygengdl2)
-- Ejecutar UNA VEZ en Supabase GDL (SQL Editor).
-- Houston (TX) no requiere cambios.

-- 1) Columna clinic en tablas operativas por sede
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS clinic text DEFAULT 'Oxygengdl';
ALTER TABLE services ADD COLUMN IF NOT EXISTS clinic text DEFAULT 'Oxygengdl';
ALTER TABLE blocked_slots ADD COLUMN IF NOT EXISTS clinic text DEFAULT 'Oxygengdl';

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_date ON appointments (clinic, full_date);
CREATE INDEX IF NOT EXISTS idx_services_clinic ON services (clinic);
CREATE INDEX IF NOT EXISTS idx_blocked_slots_clinic_date ON blocked_slots (clinic, date);

-- 2) Migrar datos existentes (antes: Guadalajara o sin sede)
UPDATE company_config
SET clinic = 'Oxygengdl'
WHERE clinic IS NULL OR clinic = 'Guadalajara';

UPDATE appointments
SET clinic = 'Oxygengdl'
WHERE clinic IS NULL OR clinic = 'Guadalajara';

UPDATE services
SET clinic = 'Oxygengdl'
WHERE clinic IS NULL OR clinic = 'Guadalajara';

UPDATE blocked_slots
SET clinic = 'Oxygengdl'
WHERE clinic IS NULL OR clinic = 'Guadalajara';

-- 3) Segunda sede: config (copia horarios de Oxygengdl; ajusta nombre/dirección en Admin)
INSERT INTO company_config (
  clinic,
  name,
  address,
  maps_url,
  phone,
  ticket_message,
  start_time,
  end_time,
  interval_mins,
  booking_limit_hours,
  cancel_limit_hours,
  master_pin,
  financial_pin,
  notify_on_booking,
  reminder_hours,
  weekly_schedule,
  calendar_feed_enabled,
  notify_auto_first,
  notify_auto_booking,
  notify_auto_reschedule,
  notify_auto_cancel,
  notify_channel_email,
  notify_channel_sms
)
SELECT
  'Oxygengdl2',
  'OXYGENDGL2',
  address,
  maps_url,
  phone,
  ticket_message,
  start_time,
  end_time,
  interval_mins,
  booking_limit_hours,
  cancel_limit_hours,
  master_pin,
  financial_pin,
  notify_on_booking,
  reminder_hours,
  weekly_schedule,
  false,
  notify_auto_first,
  notify_auto_booking,
  notify_auto_reschedule,
  notify_auto_cancel,
  notify_channel_email,
  notify_channel_sms
FROM company_config
WHERE clinic = 'Oxygengdl'
  AND NOT EXISTS (SELECT 1 FROM company_config c2 WHERE c2.clinic = 'Oxygengdl2');

-- 4) Servicios iniciales en sede 2 (misma estructura; precios se editan en Admin)
INSERT INTO services (
  name, duration, buffer, price, color, is_active, start_time, end_time, clinic
)
SELECT
  s.name, s.duration, s.buffer, s.price, s.color, s.is_active, s.start_time, s.end_time, 'Oxygengdl2'
FROM services s
WHERE (s.clinic = 'Oxygengdl' OR s.clinic IS NULL OR s.clinic = 'Guadalajara')
  AND NOT EXISTS (
    SELECT 1 FROM services s2
    WHERE s2.clinic = 'Oxygengdl2' AND lower(trim(s2.name)) = lower(trim(s.name))
  );

COMMENT ON COLUMN appointments.clinic IS 'Sede: Oxygengdl | Oxygengdl2 | Shenandoah (TX en otra BD)';
COMMENT ON COLUMN services.clinic IS 'Sede GDL; precios independientes por sede';
COMMENT ON COLUMN blocked_slots.clinic IS 'Sede del bloqueo de agenda';
