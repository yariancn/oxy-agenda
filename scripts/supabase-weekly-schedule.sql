-- Horario semanal por clínica (días laborables + horario especial por día).
-- Ejecutar en Supabase GDL y TX.

alter table company_config
  add column if not exists weekly_schedule jsonb;

comment on column company_config.weekly_schedule is 'JSON por día (mon..sun): open, custom_hours, start_time, end_time. start_time/end_time de company_config = horario base.';
