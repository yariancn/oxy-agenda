import { DESIGN_AUDIT_SEVERITY } from './constants.js';

/**
 * Hallazgos estáticos del diseño actual — sin modificar archivos existentes.
 * El agente los reporta al administrador maestro para priorizar hardening.
 */
export const KNOWN_DESIGN_GAPS = [
  {
    id: 'staff_db_role_gates_partial',
    severity: DESIGN_AUDIT_SEVERITY.MEDIUM,
    area: 'api',
    file: 'lib/staffDbPermissions.js',
    findingEs: 'Ya hay gates por tabla/acción en /api/staff/db; SELECT de users_staff/user_roles sigue permitido a staff (necesario para la app) con pins/secretos filtrados.',
    recommendationEs: 'Valorar endpoints dedicados de admin para dejar de exponer listados de staff al nivel 3.',
  },
  {
    id: 'admin_tabs_client_side',
    severity: DESIGN_AUDIT_SEVERITY.HIGH,
    area: 'permissions',
    file: 'app/page.js',
    findingEs: 'Admin, Servicios y bloqueos de agenda dependen de currentUserLevel en cliente (API ya filtra mutaciones sensibles).',
    recommendationEs: 'Centralizar en lib/staffPermissions.js y reutilizar en UI + API + agente.',
  },
  {
    id: 'session_trusts_client_clinic',
    severity: DESIGN_AUDIT_SEVERITY.MEDIUM,
    area: 'api',
    file: 'app/api/staff/db/route.js',
    findingEs: 'La clínica activa viene del body del cliente; se valida allowedClinics pero no se deriva solo de sesión.',
    recommendationEs: 'Derivar clínica de sesión + override explícito validado.',
  },
  {
    id: 'no_agent_audit_trail',
    severity: DESIGN_AUDIT_SEVERITY.MEDIUM,
    area: 'agent',
    file: 'lib/agent/',
    findingEs: 'Aún no existe bitácora de acciones del agente (quién preguntó, qué herramienta, resultado).',
    recommendationEs: 'Registrar en audit_logs con prefijo [AGENT] al integrar.',
  },
  {
    id: 'screenshot_ocr_client_only',
    severity: DESIGN_AUDIT_SEVERITY.LOW,
    area: 'intake',
    file: 'components/ScreenshotAppointmentModal.js',
    findingEs: 'OCR de captura corre en navegador; no hay validación servidor del texto extraído antes de agendar.',
    recommendationEs: 'Opcional: re-validar fecha/hora/equipo en servidor al guardar desde captura.',
  },
];

export function runDesignAudit() {
  const bySeverity = {};
  for (const gap of KNOWN_DESIGN_GAPS) {
    bySeverity[gap.severity] = (bySeverity[gap.severity] || 0) + 1;
  }

  return {
    scannedAt: new Date().toISOString(),
    total: KNOWN_DESIGN_GAPS.length,
    bySeverity,
    findings: KNOWN_DESIGN_GAPS,
    healthy: KNOWN_DESIGN_GAPS.filter((g) => g.severity === DESIGN_AUDIT_SEVERITY.CRITICAL).length === 0,
  };
}

export function findingsForMaster(audit) {
  return (audit?.findings || []).filter((f) =>
    [DESIGN_AUDIT_SEVERITY.CRITICAL, DESIGN_AUDIT_SEVERITY.HIGH].includes(f.severity),
  );
}
