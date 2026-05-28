-- Ejecutar en Supabase SQL Editor (GDL y TX por separado).
-- Códigos de promotores por clínica (no se comparten entre proyectos).

create table if not exists promoters (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Ejemplos (opcional):
-- insert into promoters (code, name) values ('ANA01', 'Ana García'), ('PEDRO02', 'Pedro López');
