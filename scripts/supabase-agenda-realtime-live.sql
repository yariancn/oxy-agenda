-- Cross-device live agenda push via Supabase Realtime (avoids Vercel polling bandwidth).
-- Run on BOTH projects (GDL and TX).
--
-- Uses a tiny public table (clinic + rev only) so anon Realtime never sees PINs / config secrets.

ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS agenda_rev bigint NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS agenda_live_ping (
  clinic text PRIMARY KEY,
  agenda_rev bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed one row per clinic config
INSERT INTO agenda_live_ping (clinic, agenda_rev)
SELECT clinic, COALESCE(agenda_rev, 1)
FROM company_config
ON CONFLICT (clinic) DO UPDATE
SET agenda_rev = EXCLUDED.agenda_rev,
    updated_at = now();

ALTER TABLE agenda_live_ping ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oxy_anon_select_agenda_live_ping ON agenda_live_ping;
CREATE POLICY oxy_anon_select_agenda_live_ping
  ON agenda_live_ping
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON agenda_live_ping TO anon, authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE agenda_live_ping;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN
    RAISE NOTICE 'Enable Realtime for agenda_live_ping in the Supabase dashboard if needed';
END $$;
