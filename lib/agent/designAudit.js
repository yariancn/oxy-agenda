import { DESIGN_AUDIT_SEVERITY } from './constants.js';

/**
 * Hallazgos estáticos del diseño actual — sin modificar archivos existentes.
 * El agente los reporta al administrador maestro para priorizar hardening.
 */
export const KNOWN_DESIGN_GAPS = [
  {
    id: 'ui_only_reports_gate',
    severity: DESIGN_AUDIT_SEVERITY.CRITICAL,
    area: 'permissions',
    file: 'app/page.js',
    findingEs: 'Reportes y ventas solo se ocultan en UI (currentUserLevel <= 2). No hay chequeo de nivel en /api/staff/db.',
    recommendationEs: 'Agregar assertStaffRoleLevel en rutas API antes de devolver ventas o audit_logs.',
  },
  {
    id: 'staff_db_clinic_only',
    severity: DESIGN_AUDIT_SEVERITY.CRITICAL,
    area: 'api',
    file: 'app/api/staff/db/route.js',
    findingEs: 'POST /api/staff/db valida clínica pero no nivel de rol. Cualquier staff autenticado podría consultar tablas permitidas si conoce el payload.',
    recommendationEs: 'Filtrar tablas y acciones por nivel (ej. audit_logs solo nivel <= 2).',
  },
  {
    id: 'admin_tabs_client_side',
    severity: DESIGN_AUDIT_SEVERITY.HIGH,
    area: 'permissions',
    file: 'app/page.js',
    findingEs: 'Admin, Servicios y bloqueos de agenda dependen de currentUserLevel en cliente.',
    recommendationEs: 'Centralizar en lib/staffPermissions.js y reutilizar en API + agente.',
  },
  {
    id: 'master_only_features_ui',
    severity: DESIGN_AUDIT_SEVERITY.HIGH,
    area: 'permissions',
    file: 'app/page.js',
    findingEs: 'Gestión de roles y funciones nivel 1 (currentUserLevel === 1) solo en UI.',
    recommendationEs: 'Proteger mutaciones de users_staff y user_roles en servidor.',
  },
  {
    id: 'session_trusts_client_clinic',
    severity: DESIGN_AUDIT_SEVERITY.MEDIUM,
    area: 'api',
    file: 'app/api/staff/db/route.js',
    findingEs: 'La clínica activa viene del body del cliente; la sesión ya trae allowedClinics pero no se valida rol por acción.',
    recommendationEs: 'El agente y las APIs deben derivar clínica de sesión + override explícito validado.',
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
