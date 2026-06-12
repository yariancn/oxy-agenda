-- Link de Google Maps por clínica (opcional; si está vacío se genera desde address)
ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS maps_url text;

COMMENT ON COLUMN company_config.maps_url IS 'URL de Google Maps de la clínica. Si está vacía, se genera automáticamente desde address.';
