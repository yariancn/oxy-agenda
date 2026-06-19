-- Feed iCal por clínica (Google Calendar / Apple / Outlook — suscripción por URL).
-- Ejecutar en Supabase GDL y TX.

alter table company_config
  add column if not exists calendar_feed_enabled boolean not null default false;

alter table company_config
  add column if not exists calendar_feed_token text;

comment on column company_config.calendar_feed_enabled is 'Si true, la URL secreta del feed expone citas activas de la clínica.';
comment on column company_config.calendar_feed_token is 'Token secreto para /api/calendar/feed (regenerar invalida suscripciones anteriores).';
