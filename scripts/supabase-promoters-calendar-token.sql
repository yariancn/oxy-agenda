-- Token de feed iCal por promotor (revocar/regenerar sin afectar a otros).
-- Ejecutar en Supabase GDL y TX.

alter table promoters
  add column if not exists calendar_feed_token text;

comment on column promoters.calendar_feed_token is 'URL secreta solo para citas referidas por este promotor (/api/calendar/feed).';
