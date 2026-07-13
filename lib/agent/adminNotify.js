import { findingsForMaster } from './designAudit.js';

/**
 * Notificaciones al administrador maestro cuando el agente detecta riesgos de diseño.
 * Persistencia futura: audit_logs o canal email; por ahora estructura en memoria.
 */
export function buildAdminDesignAlert(audit, { locale = 'es' } = {}) {
  const critical = findingsForMaster(audit);
  if (!critical.length) {
    return {
      shouldNotify: false,
      title: locale === 'en' ? 'No critical design issues' : 'Sin hallazgos críticos',
      body: '',
      findings: [],
    };
  }

  const title = locale === 'en'
    ? `Agent design audit: ${critical.length} issue(s) need attention`
    : `Auditoría del agente: ${critical.length} hallazgo(s) requieren atención`;

  const lines = critical.map((f, i) => {
    const text = locale === 'en' ? f.findingEs : f.findingEs;
    const rec = locale === 'en' ? f.recommendationEs : f.recommendationEs;
    return `${i + 1}. [${f.severity.toUpperCase()}] ${text}\n   → ${rec}`;
  });

  return {
    shouldNotify: true,
    title,
    body: lines.join('\n\n'),
    findings: critical,
    notifiedAt: new Date().toISOString(),
  };
}

export function shouldNotifyMasterOnSession(ctx) {
  return ctx?.authenticated && ctx.isMaster;
}
