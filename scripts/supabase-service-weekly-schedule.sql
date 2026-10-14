-- ============================================================================
-- REQUERIDO para horario por día en equipos (ej. Cámara 1 sábado 9:30–12:30)
-- Ejecutar en el SQL Editor de Supabase de la clínica (GDL y/o TX).
-- Si no corre este script, la app aparenta guardar pero el horario por día NO queda.
-- ============================================================================

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS weekly_schedule jsonb;

COMMENT ON COLUMN services.weekly_schedule IS
  'JSON por día (mon..sun): open, custom_hours, start_time, end_time. start_time/end_time del servicio = horario base (ventana operativa; fin = última sesión + bloque).';

-- Comprueba que la columna exista:
-- select column_name from information_schema.columns
-- where table_name = 'services' and column_name = 'weekly_schedule';
