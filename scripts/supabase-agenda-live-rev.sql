-- Lightweight live-sync revision for open agenda screens.
-- Run on BOTH Supabase projects (GDL and TX).
--
-- IMPORTANT: Supabase enables pg-safeupdate, so every UPDATE must include a WHERE clause.
-- A trigger that does `UPDATE company_config SET ...` with no WHERE will break
-- appointment seals / saves with: "UPDATE requires a WHERE clause".

ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS agenda_rev bigint NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION oxy_bump_agenda_live_rev()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- WHERE true satisfies pg-safeupdate while bumping all clinic rows in this DB.
  UPDATE company_config
  SET agenda_rev = COALESCE(agenda_rev, 0) + 1
  WHERE true;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_oxy_bump_agenda_rev_appointments ON appointments;
CREATE TRIGGER trg_oxy_bump_agenda_rev_appointments
AFTER INSERT OR UPDATE OR DELETE ON appointments
FOR EACH ROW EXECUTE FUNCTION oxy_bump_agenda_live_rev();

DROP TRIGGER IF EXISTS trg_oxy_bump_agenda_rev_blocked ON blocked_slots;
CREATE TRIGGER trg_oxy_bump_agenda_rev_blocked
AFTER INSERT OR UPDATE OR DELETE ON blocked_slots
FOR EACH ROW EXECUTE FUNCTION oxy_bump_agenda_live_rev();

DROP TRIGGER IF EXISTS trg_oxy_bump_agenda_rev_services ON services;
CREATE TRIGGER trg_oxy_bump_agenda_rev_services
AFTER INSERT OR UPDATE OR DELETE ON services
FOR EACH ROW EXECUTE FUNCTION oxy_bump_agenda_live_rev();
