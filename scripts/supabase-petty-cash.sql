-- Caja chica y eventos de caja (independiente de pacientes / citas).
-- Ejecutar en cada proyecto Supabase (GDL y TX).

-- Gastos de caja chica (efectivo)
CREATE TABLE IF NOT EXISTS petty_cash_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic text NOT NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_petty_cash_expenses_clinic_created
  ON petty_cash_expenses (clinic, created_at DESC);

COMMENT ON TABLE petty_cash_expenses IS 'Gastos de caja chica en efectivo. Independiente de pacientes.';

-- Arqueos (conteo) y cortes de retiro
CREATE TABLE IF NOT EXISTS cash_drawer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('arqueo', 'retiro')),
  float_amount numeric(12, 2) NOT NULL DEFAULT 0,
  cash_sales_total numeric(12, 2) NOT NULL DEFAULT 0,
  expenses_total numeric(12, 2) NOT NULL DEFAULT 0,
  expected_in_drawer numeric(12, 2) NOT NULL DEFAULT 0,
  withdraw_amount numeric(12, 2) NOT NULL DEFAULT 0,
  counted_amount numeric(12, 2) NOT NULL DEFAULT 0,
  difference numeric(12, 2) NOT NULL DEFAULT 0,
  matched boolean NOT NULL DEFAULT false,
  delivered_by text NOT NULL DEFAULT '',
  received_by text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  ticket_count integer NOT NULL DEFAULT 0,
  expense_count integer NOT NULL DEFAULT 0,
  period_from timestamptz,
  period_to timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_drawer_events_clinic_type_created
  ON cash_drawer_events (clinic, event_type, created_at DESC);

COMMENT ON TABLE cash_drawer_events IS 'Arqueo diario (conteo) y corte de retiro. Independiente de pacientes.';
COMMENT ON COLUMN cash_drawer_events.event_type IS 'arqueo = solo conteo; retiro = entrega de excedente (deja fondo fijo).';

ALTER TABLE petty_cash_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE petty_cash_expenses FORCE ROW LEVEL SECURITY;
ALTER TABLE cash_drawer_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_drawer_events FORCE ROW LEVEL SECURITY;
