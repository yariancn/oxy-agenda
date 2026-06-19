-- Ejecutar en Supabase GDL y TX (una vez por clínica).
-- Notas internas del promotor + código en citas para referencia rápida.

alter table promoters
  add column if not exists notes text not null default '';

alter table appointments
  add column if not exists promoter_code text;

comment on column promoters.notes is 'Notas internas del promotor (visible en admin y en detalle de cita).';
comment on column appointments.promoter_code is 'Código de promotor/referido al agendar (portal o staff).';
