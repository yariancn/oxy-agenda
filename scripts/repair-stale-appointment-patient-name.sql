-- Reparar cita con nombre viejo cuando el expediente ya fue renombrado.
-- Ejecutar en Supabase SQL (GDL).

-- 1) Ver citas activas con nombre desactualizado (mismo teléfono, distinto nombre)
SELECT
  a.id,
  a.patient AS nombre_en_cita,
  p."Name" AS nombre_en_expediente,
  a.phone,
  a.full_date,
  a.time,
  a.check_in_status,
  a.equipment
FROM appointments a
JOIN patients p ON right(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g'), 10)
  = right(regexp_replace(coalesce(p."Phone", ''), '\D', '', 'g'), 10)
WHERE a.check_in_status NOT IN ('Cancelado', 'Finalizado')
  AND lower(trim(a.patient)) <> lower(trim(coalesce(p."Name", '')));

-- 2) Corregir una cita concreta (reemplaza UUID y nombre canónico del expediente)
-- UPDATE appointments
-- SET patient = 'Maria de Jesús'
-- WHERE id = 'UUID-DE-LA-CITA';
