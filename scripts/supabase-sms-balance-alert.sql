-- Alerta de saldo bajo LabsMobile (evita SMS repetidos en 24 h)
-- Ejecutar UNA VEZ en Supabase GDL

ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS sms_balance_alert_at timestamptz;
