import {
  CONFIRMATION_STATUS,
  findPendingConfirmationByPhone,
  parseConfirmationReply,
} from './appointmentConfirmation.js';
import { CANCEL_REQUEST_STATUS } from './appointmentManage.js';
import { getClinicTimezone, normalizeClinicId, selectCompanyConfigForClinic } from './clinicRegistry.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';
import { dispatchStaffConfirmationReplyAlert } from './staffBookingAlert.js';
import { bumpAgendaLiveRev } from './agendaLiveRev.js';
import { localeForClinic } from './i18n.js';
import { insertAuditLog, publicCancelAuditLabels } from './auditLog.js';

/**
 * Process a YES/NO (or SI/NO) confirmation reply for a clinic.
 * Shared by Twilio (Houston) and LabsMobile (GDL) inbound webhooks.
 */
export async function processConfirmationInboundReply({
  clinicName,
  fromPhone,
  bodyText,
}) {
  const clinicId = normalizeClinicId(clinicName);
  const reply = parseConfirmationReply(bodyText);
  if (!reply) {
    return { ok: false, error: 'unrecognized_reply', reply: null };
  }

  const supabase = getSupabaseAdmin(clinicId);
  const timezone = getClinicTimezone(clinicId);
  const now = new Date();
  const fromIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const toIso = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('id, patient, phone, time, full_date, equipment, confirmation_status, confirmation_sent_at, notes')
    .gte('full_date', fromIso)
    .lte('full_date', toIso)
    .eq('confirmation_status', CONFIRMATION_STATUS.PENDING);
  if (error) throw error;

  const match = findPendingConfirmationByPhone({
    appointments: appointments || [],
    phone: fromPhone,
    timezone,
  });

  if (!match) {
    return { ok: false, error: 'no_pending', reply };
  }

  const nextStatus = reply === 'confirmed'
    ? CONFIRMATION_STATUS.CONFIRMED
    : CONFIRMATION_STATUS.DECLINED;

  const stamp = new Date().toLocaleString(localeForClinic(clinicId) === 'en' ? 'en-US' : 'es-MX', {
    timeZone: timezone,
  });
  const declineNote = reply === 'declined'
    ? `[PACIENTE SMS ${stamp}] Respondió NO — cancelación pendiente de aprobación del staff.`
    : null;
  const newNotes = declineNote
    ? (match.notes ? `${match.notes}\n${declineNote}` : declineNote)
    : undefined;

  const { error: updateErr } = await supabase
    .from('appointments')
    .update({
      confirmation_status: nextStatus,
      confirmation_replied_at: new Date().toISOString(),
      confirmation_reply: String(bodyText || '').trim().slice(0, 160),
      ...(reply === 'declined'
        ? {
          check_in_status: CANCEL_REQUEST_STATUS,
          ...(newNotes ? { notes: newNotes } : {}),
        }
        : {}),
    })
    .eq('id', match.id)
    .eq('confirmation_status', CONFIRMATION_STATUS.PENDING);

  if (updateErr) throw updateErr;

  await bumpAgendaLiveRev(supabase, clinicId).catch(() => null);

  const [{ data: companyConfig }, { data: staffRoster }] = await Promise.all([
    selectCompanyConfigForClinic(supabase, clinicId),
    supabase
      .from('users_staff')
      .select('name, email, phone, notify_on_booking, is_active')
      .eq('is_active', true),
  ]);

  const locale = localeForClinic(clinicId);

  await dispatchStaffConfirmationReplyAlert({
    companyConfig: companyConfig || {},
    staffRoster: staffRoster || [],
    clinicName: clinicId,
    clinicDisplayName: companyConfig?.name,
    patientName: match.patient,
    date: match.full_date,
    time: match.time,
    equipment: match.equipment,
    locale,
    reply,
    replyText: bodyText,
  }).catch(() => null);

  if (reply === 'confirmed') {
    await insertAuditLog(supabase, {
      appointmentId: match.id,
      patientName: match.patient,
      action: locale === 'en' ? 'CONFIRMATION SMS (YES)' : 'CONFIRMACIÓN SMS (SI)',
      changedBy: locale === 'en' ? 'Patient (SMS)' : 'Paciente (SMS)',
      details: `${match.full_date} ${match.time} · ${match.equipment || ''} · reply: ${String(bodyText || '').trim().slice(0, 40)}`,
    });
  } else {
    const cancelAudit = publicCancelAuditLabels(locale, 'sms_no');
    await insertAuditLog(supabase, {
      appointmentId: match.id,
      patientName: match.patient,
      action: cancelAudit.action,
      changedBy: cancelAudit.changedBy,
      details: `Pending approval · ${match.full_date} ${match.time} · ${match.equipment || ''} · reply: ${String(bodyText || '').trim().slice(0, 40)}`,
    });
  }

  return {
    ok: true,
    reply,
    appointment: match,
    nextStatus,
  };
}
