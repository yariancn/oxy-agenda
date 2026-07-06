-- Diagnóstico: citas cuyo equipo no coincide con ningún servicio activo (suelen "desaparecer" del calendario).
-- Ejecutar en Supabase SQL Editor (clínica afectada).

SELECT
  a.equipment,
  COUNT(*) AS citas_activas,
  MIN(a.full_date) AS primera,
  MAX(a.full_date) AS ultima
FROM appointments a
WHERE a.check_in_status IS DISTINCT FROM 'Cancelado'
  AND TRIM(COALESCE(a.equipment, '')) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM services s
    WHERE s.is_active IS NOT FALSE
      AND TRIM(s.name) = TRIM(a.equipment)
  )
GROUP BY a.equipment
ORDER BY citas_activas DESC;

-- Para renombrar manualmente (ejemplo: devolver nombre anterior del equipo):
-- UPDATE appointments SET equipment = 'CÁMARA 1' WHERE equipment = 'NOMBRE NUEVO INCORRECTO';
-- UPDATE blocked_slots SET equipment = 'CÁMARA 1' WHERE equipment = 'NOMBRE NUEVO INCORRECTO';
