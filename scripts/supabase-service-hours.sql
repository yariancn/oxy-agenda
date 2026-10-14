-- Horario de trabajo por equipo/servicio (opcional; si es NULL usa company_config)
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS start_time text,
  ADD COLUMN IF NOT EXISTS end_time text,
  ADD COLUMN IF NOT EXISTS weekly_schedule jsonb;

COMMENT ON COLUMN services.start_time IS 'Primera sesión base (ej. 09:00). NULL = usar company_config.start_time';
COMMENT ON COLUMN services.end_time IS 'Fin de ventana operativa (= última sesión + bloque). NULL = usar company_config.end_time';
COMMENT ON COLUMN services.weekly_schedule IS 'JSON por día (mon..sun): open, custom_hours, start_time, end_time';