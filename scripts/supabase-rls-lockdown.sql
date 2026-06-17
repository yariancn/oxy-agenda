-- OXY Agenda: bloquear acceso directo con anon key (RLS sin políticas públicas).
-- Ejecutar UNA VEZ en Supabase GDL y UNA VEZ en Supabase TX (Shenandoah).
-- La app usa service role solo en rutas API del servidor (Vercel).

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'patients',
    'appointments',
    'services',
    'users_staff',
    'blocked_slots',
    'company_config',
    'protocols',
    'user_roles',
    'promoters',
    'audit_logs'
  ]
  LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;
END $$;

-- Revoca acceso directo del rol anon/authenticated (defensa extra).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

COMMENT ON SCHEMA public IS 'OXY Agenda: acceso vía API server-side con service role; anon key sin políticas RLS.';
