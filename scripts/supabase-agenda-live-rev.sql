-- Lightweight live-sync revision for open agenda screens.
-- Run on BOTH Supabase projects (GDL and TX).
--
-- IMPORTANT: Do NOT attach triggers that UPDATE company_config without a WHERE
-- clause — Supabase pg-safeupdate will break appointment seals with:
-- "UPDATE requires a WHERE clause".
--
-- Live sync bump is handled in the app (bumpAgendaLiveRev). This script only
-- ensures the agenda_rev column (+ a safe helper function) exists.

ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS agenda_rev bigint NOT NULL DEFAULT 1;

-- Remove any previously installed unsafe triggers.
DROP TRIGGER IF EXISTS trg_oxy_bump_agenda_rev_appointments ON appointments;
DROP TRIGGER IF EXISTS trg_oxy_bump_agenda_rev_blocked ON blocked_slots;
DROP TRIGGER IF EXISTS trg_oxy_bump_agenda_rev_services ON services;

CREATE OR REPLACE FUNCTION oxy_bump_agenda_live_rev()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE company_config
  SET agenda_rev = COALESCE(agenda_rev, 0) + 1
  WHERE true;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Triggers intentionally NOT recreated. App-side bump is enough and safer.
