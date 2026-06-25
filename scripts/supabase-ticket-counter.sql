-- Folio consecutivo de tickets POS (inicia en 793 por clínica).
ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS ticket_counter integer DEFAULT 793;

COMMENT ON COLUMN company_config.ticket_counter IS 'Siguiente folio de ticket POS; el primero emitido usa este valor y luego se incrementa.';
