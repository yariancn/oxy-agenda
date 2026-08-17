import { CANCEL_REQUEST_STATUS } from './appointmentManage.js';
import { CONFIRMATION_STATUS, appointmentStartMs, digitsMatch } from './appointmentConfirmation.js';
import { getClinicTimezone, normalizeClinicId } from './clinicRegistry.js';
import { digitsOnly } from './ensurePatient.js';
import { selectWithColumnFallback } from './supabaseSelectSafe.js';
import { insertAuditLog, publicCancelAuditLabels } from './auditLog.js';
import { bumpAgendaLiveRev } from './agendaLiveRev.js';

export const SMS_OPT_OUT_MARKER = '⟦oxy:sms-opt-out⟧';

const OPT_OUT_RE = /^(stop|parar|baja|cancelar|unsubscribe|end|quit|stopall|unsub)\b/i;
const CLOSED = new Set([
  'Cancelado',
  CANCEL_REQUEST_STATUS,
  'Finalizado',
  'Devuelto',
  'No Asistió',
  'Falta Justificada',
  'Completed',
  'Cancelled',
]);

export function isSmsOptOutKeyword(body) {
  const text = String(body || '').trim();
  if (!text) return false;
  const normalized = text.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return OPT_OUT_RE.test(normalized);
}

export function appointmentHasSmsOptOut(appointment = {}) {
  if (isSmsOptOutKeyword(appointment.confirmation_reply)) return true;
  const notes = `${appointment.notes || ''} ${appointment.patientNotes || ''}`;
  return notes.includes(SMS_OPT_OUT_MARKER);
}

export function patientHasSmsOptOut({ notes, patientNotes, confirmation_reply } = {}) {
  if (isSmsOptOutKeyword(confirmation_reply)) return true;
  return `${notes || ''} ${patientNotes || ''}`.includes(SMS_OPT_OUT_MARKER);
}

function appendMarker(existing, extraLine) {
  const current = String(existing || '').trim();
  if (current.includes(SMS_OPT_OUT_MARKER)) {
    return current;
  }
  return [current, `${SMS_OPT_OUT_MARKER} ${extraLine}`].filter(Boolean).join('\n');
}

function patientNameOf(row) {
  return String(row?.patient || row?.Name || row?.name || row?.Nombre || '').trim();
}

function patientPhoneOf(row) {
  return String(row?.phone || row?.Phone || '').trim();
}

/**
 * STOP / BAJA: turn off SMS prefs and mark the next visit as cancellation pending staff.
 */
export async function applySmsOptOut({
  supabase,
  clinicName,
  phone,
  body = 'STOP',
} = {}) {
  if (!supabase || !phone) {
    return { ok: false, error: 'missing' };
  }

  const clinicId = normalizeClinicId(clinicName);
  const timezone = getClinicTimezone(clinicId);
  const stamp = new Date().toLocaleString('en-US', { timeZone: timezone });
  const replyText = String(body || 'STOP').trim().slice(0, 160);
  const extraLine = `${stamp} · ${replyText}`;

  const { data: patients, error: pErr } = await selectWithColumnFallback(
    (cols) => supabase.from('patients').select(cols).limit(4000),
    ['id', 'Name', 'name', 'Nombre', 'Phone', 'phone', 'notes', 'Notes', 'prefers_sms', 'prefers_sms_reminder'],
  );
  if (pErr) return { ok: false, error: pErr.message };

  const matchedPatients = (patients || []).filter((p) => digitsMatch(patientPhoneOf(p), phone));
  for (const pat of matchedPatients) {
    const currentNotes = pat.notes || pat.Notes || '';
    const patch = {
      prefers_sms: false,
      prefers_sms_reminder: false,
      notes: appendMarker(currentNotes, extraLine),
    };
    const { error: updPatErr } = await supabase.from('patients').update(patch).eq('id', pat.id);
    if (updPatErr && /notes|column|schema cache/i.test(updPatErr.message || '')) {
      await supabase.from('patients').update({
        prefers_sms: false,
        prefers_sms_reminder: false,
      }).eq('id', pat.id);
    }
  }

  const fromIso = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const toIso = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: appointments, error: aErr } = await selectWithColumnFallback(
    (cols) => supabase
      .from('appointments')
      .select(cols)
      .gte('full_date', fromIso)
      .lte('full_date', toIso),
    ['id', 'patient', 'phone', 'time', 'full_date', 'equipment', 'check_in_status', 'notes', 'patient_id', 'confirmation_status'],
  );
  if (aErr) return { ok: false, error: aErr.message };

  const last10 = digitsOnly(phone).slice(-10);
  const patientIds = new Set(matchedPatients.map((p) => String(p.id)));
  const upcoming = (appointments || [])
    .filter((a) => !CLOSED.has(String(a.check_in_status || 'Agendado')))
    .filter((a) => {
      if (a.patient_id && patientIds.has(String(a.patient_id))) return true;
      return digitsMatch(a.phone, phone) || (last10.length >= 10 && digitsOnly(a.phone).slice(-10) === last10);
    })
    .sort((a, b) => {
      const sa = appointmentStartMs(a.full_date, a.time, timezone) || 0;
      const sb = appointmentStartMs(b.full_date, b.time, timezone) || 0;
      return sa - sb;
    });

  const target = upcoming[0] || null;
  if (target) {
    const declineNote = `[SMS OPT-OUT ${stamp}] ${replyText} — cancellation pending staff approval.`;
    const newNotes = appendMarker(target.notes, declineNote);
    await supabase
      .from('appointments')
      .update({
        check_in_status: CANCEL_REQUEST_STATUS,
        confirmation_status: CONFIRMATION_STATUS.DECLINED,
        confirmation_replied_at: new Date().toISOString(),
        confirmation_reply: replyText,
        notes: newNotes,
      })
      .eq('id', target.id);

    const cancelAudit = publicCancelAuditLabels('en', 'sms_opt_out');
    await insertAuditLog(supabase, {
      appointmentId: target.id,
      patientName: target.patient || patientNameOf(matchedPatients[0]) || 'Patient',
      action: cancelAudit.action,
      changedBy: cancelAudit.changedBy,
      details: `SMS opt-out · ${target.full_date} ${target.time} · ${target.equipment || ''} · ${replyText}`,
    });
    await bumpAgendaLiveRev(supabase, clinicId).catch(() => null);
  }

  return {
    ok: true,
    patients: matchedPatients.length,
    appointmentId: target?.id || null,
    patientName: target?.patient || patientNameOf(matchedPatients[0]) || '',
  };
}
