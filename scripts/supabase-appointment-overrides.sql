-- Overrides staff al agendar (no aplica al portal público)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS outside_normal_hours boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_extended_block boolean DEFAULT false;

COMMENT ON COLUMN appointments.outside_normal_hours IS 'Staff: cita fuera del horario normal del equipo';
COMMENT ON COLUMN appointments.is_extended_block IS 'Staff: sesión 90 min con bloque total 3 h en agenda';
