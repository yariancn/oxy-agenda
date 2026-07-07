-- Ocupación simulada solo en portal de clientes (demo ~30%)
-- Ejecutar en Supabase GDL y TX.

ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS demo_occupancy_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_occupancy_percent integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS demo_occupancy_slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS demo_occupancy_overrides jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN company_config.demo_occupancy_enabled IS 'Si true, el portal público muestra ~30% ocupación simulada.';
COMMENT ON COLUMN company_config.demo_occupancy_percent IS 'Porcentaje de huecos libres a marcar como ocupados en el portal.';
COMMENT ON COLUMN company_config.demo_occupancy_slots IS 'Lista de slots simulados: equipment|fecha|hora';
COMMENT ON COLUMN company_config.demo_occupancy_overrides IS 'Slots simulados liberados manualmente en el portal.';
