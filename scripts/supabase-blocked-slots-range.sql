-- Bloqueos de agenda por rango de fechas (end_date inclusive).
-- Ejecutar en cada proyecto Supabase (GDL y TX).

ALTER TABLE blocked_slots ADD COLUMN IF NOT EXISTS end_date date;

UPDATE blocked_slots
SET end_date = date::date
WHERE end_date IS NULL
  AND date IS NOT NULL
  AND btrim(date::text) <> '';

CREATE INDEX IF NOT EXISTS idx_blocked_slots_clinic_date_range
  ON blocked_slots (clinic, date, end_date);

COMMENT ON COLUMN blocked_slots.end_date IS 'Último día del bloqueo (inclusive). Si coincide con date, es un solo día.';
