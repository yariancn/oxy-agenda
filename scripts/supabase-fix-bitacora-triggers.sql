-- FIX FIRMA / BITÁCORA + live sync
-- Ejecutar en GDL y TX (SQL Editor).
--
-- Causa del error "UPDATE requires a WHERE clause" al firmar:
-- el trigger oxy_bump_agenda_live_rev hacía UPDATE company_config SIN WHERE
-- y pg-safeupdate de Supabase lo bloquea.
--
-- Solución segura: QUITAR los triggers (el bump lo hace ya la app)
-- y dejar la función corregida por si se reactivan después.

ALTER TABLE company_config
  ADD COLUMN IF NOT EXISTS agenda_rev bigint NOT NULL DEFAULT 1;

-- 1) Quitar triggers que rompen el sello de bitácora
DROP TRIGGER IF EXISTS trg_oxy_bump_agenda_rev_appointments ON appointments;
DROP TRIGGER IF EXISTS trg_oxy_bump_agenda_rev_blocked ON blocked_slots;
DROP TRIGGER IF EXISTS trg_oxy_bump_agenda_rev_services ON services;

-- 2) Función corregida (por si más adelante se vuelven a crear triggers)
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

-- Verificación (debe devolver 0 filas):
-- SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_oxy_bump_agenda_rev%';
