import { requireClinic } from '../agentServices.js';
import { AGENT_TOOL_IDS } from '../constants.js';
import { currencyForClinic } from '../../clinicRegistry.js';

function es(locale, esText, enText) {
  return locale === 'en' ? enText : esText;
}

export async function handleViewDayReport({ ctx, params, services, locale }) {
  requireClinic(ctx, services);
  const date = params.fullDate || services.clinicToday();
  const appointments = await services.listAppointments({ fullDate: date });
  const lines = appointments.map((a) =>
    `• ${a.time} · ${a.patient} · ${a.equipment} · ${a.check_in_status} · ${a.attendant || 'N/A'}`,
  );
  return {
    ok: true,
    reply: `${es(locale, 'Reporte del día', 'Day report')} ${date} (${appointments.length}):\n${lines.join('\n') || es(locale, 'Sin citas.', 'No appointments.')}`,
    data: { date, appointments },
  };
}

export async function handleViewSalesReport({ ctx, params, services, locale }) {
  requireClinic(ctx, services);
  const start = params.fullDate || services.clinicToday();
  const summary = await services.listSalesSummary({ startDate: start, endDate: start });
  const currency = currencyForClinic(services.clinic);
  return {
    ok: true,
    reply: es(
      locale,
      `Ventas ${start}:\n• Ingresos: $${summary.revenue.toLocaleString()} ${currency}\n• Transacciones: ${summary.txCount}\n• Sesiones finalizadas: ${summary.finalized}\n• Devueltas: ${summary.returned}`,
      `Sales ${start}:\n• Revenue: $${summary.revenue.toLocaleString()} ${currency}\n• Transactions: ${summary.txCount}\n• Completed: ${summary.finalized}\n• Returned: ${summary.returned}`,
    ),
    data: summary,
  };
}

export async function handleViewBlackBox({ ctx, params, services, locale }) {
  requireClinic(ctx, services);
  const logs = await services.listAuditLogs({ limit: 15 });
  if (!logs.length) {
    return { ok: true, reply: es(locale, 'Sin registros recientes en caja negra.', 'No recent audit logs.'), data: { logs: [] } };
  }
  const lines = logs.map((l) => {
    const when = String(l.created_at || '').slice(0, 16).replace('T', ' ');
    return `• ${when} · ${l.action || l.event || 'evento'} · ${l.detail || l.description || ''}`.trim();
  });
  return {
    ok: true,
    reply: `${es(locale, 'Últimos movimientos', 'Recent audit')}:\n${lines.join('\n')}`,
    data: { logs },
  };
}

export async function handleViewPatientLedger({ ctx, params, services, locale }) {
  requireClinic(ctx, services);
  const q = params.patient || params.query.replace(/libro|ledger|ventas\s+de/i, '').trim();
  if (!q) {
    return { ok: false, error: 'validation_failed', message: es(locale, 'Indica el nombre del paciente.', 'Provide patient name.') };
  }
  const patients = await services.listPatients({ search: q });
  const patient = patients.find((p) => String(p.patient).toLowerCase().includes(q.toLowerCase())) || patients[0];
  if (!patient) {
    return { ok: false, error: 'not_found', message: es(locale, 'Paciente no encontrado.', 'Patient not found.') };
  }
  const { data } = await services.supabase.from('patients').select('*').eq('id', patient.id).maybeSingle();
  const history = data?.packageHistory || [];
  if (!history.length) {
    return { ok: true, reply: es(locale, `${patient.patient}: sin movimientos en cartera.`, `${patient.patient}: no ledger entries.`), data: { patient } };
  }
  const lines = history.slice(-10).map((tx) =>
    `• ${tx.date || '—'} · $${Number(tx.price || 0).toLocaleString()} · ${tx.description || tx.type || 'movimiento'}`,
  );
  return {
    ok: true,
    reply: `${patient.patient} — ${es(locale, 'últimos movimientos', 'recent entries')}:\n${lines.join('\n')}`,
    data: { patient, history },
  };
}

export const REPORT_HANDLERS = {
  [AGENT_TOOL_IDS.VIEW_DAY_REPORT]: handleViewDayReport,
  [AGENT_TOOL_IDS.VIEW_SALES_REPORT]: handleViewSalesReport,
  [AGENT_TOOL_IDS.VIEW_BLACK_BOX]: handleViewBlackBox,
  [AGENT_TOOL_IDS.VIEW_PATIENT_LEDGER]: handleViewPatientLedger,
};
