-- Limpia marcadores técnicos de importación Setmore en notas de pacientes y citas.
-- Ejecutar en Supabase GDL (y TX si aplica).

UPDATE patients
SET notes = NULLIF(trim(
  regexp_replace(
    coalesce(notes, ''),
    '(^|\n|\s·\s*)import-setmore-gdl[^·\n]*',
    '',
    'gi'
  )
), '')
WHERE coalesce(notes, '') ILIKE '%import-setmore%'
   OR coalesce(notes, '') ILIKE '%setmore:%'
   OR coalesce(notes, '') ILIKE '%importar%setmore%';

UPDATE appointments
SET notes = NULLIF(trim(
  regexp_replace(
    coalesce(notes, ''),
    '(^|\n|\s·\s*)import-setmore-gdl[^·\n]*',
    '',
    'gi'
  )
), '')
WHERE coalesce(notes, '') ILIKE '%import-setmore%'
   OR coalesce(notes, '') ILIKE '%setmore:%';
