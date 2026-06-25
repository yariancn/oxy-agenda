-- Sesiones tomadas sin saldo pagado en cartera (adeudo).
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS adeudo integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN patients.adeudo IS 'Sesiones consumidas sin pago previo; se liquida al cobrar en POS.';
