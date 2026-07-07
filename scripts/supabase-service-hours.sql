-- Horario de trabajo por equipo/servicio (opcional; si es NULL usa company_config)
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS start_time text,
  ADD COLUMN IF NOT EXISTS end_time text;

COMMENT ON COLUMN services.start_time IS 'Hora de inicio del servicio (ej. 09:00). NULL = usar company_config.start_time';
COMMENT ON COLUMN services.end_time IS 'Hora de fin del servicio (ej. 18:00). NULL = usar company_config.end_time';