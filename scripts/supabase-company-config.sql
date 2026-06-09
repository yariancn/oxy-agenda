-- Configuración general de clínica (horarios, NIPs, notificaciones)
-- Ejecutar en Supabase GDL y TX (Shenandoah)

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

-- Valores por defecto en filas existentes sin horario
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
  reminder_hours = COALESCE(reminder_hours, 24)
WHERE start_time IS NULL OR end_time IS NULL OR interval_mins IS NULL;

COMMENT ON COLUMN company_config.start_time IS 'Hora de apertura de la clínica (HH:MM)';
COMMENT ON COLUMN company_config.end_time IS 'Hora de cierre de la clínica (HH:MM)';
