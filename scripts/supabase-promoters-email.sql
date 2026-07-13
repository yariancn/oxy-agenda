-- Promoter email for no-show notifications (run on Supabase GDL and TX).
ALTER TABLE promoters
  ADD COLUMN IF NOT EXISTS email text;

COMMENT ON COLUMN promoters.email IS 'Optional: notified when a referred patient is marked no-show';
