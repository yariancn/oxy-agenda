-- Horario semanal por equipo (días con horario distinto al base del servicio)
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS weekly_schedule jsonb;

COMMENT ON COLUMN services.weekly_schedule IS
  'JSON por día (mon..sun): open, custom_hours, start_time, end_time. start_time/end_time del servicio = horario base (ventana operativa; fin = última sesión + bloque).';
