import { CONFIRMATION_STATUS, findPendingConfirmationByPhone, parseConfirmationReply } from './appointmentConfirmation.js';
import { CANCEL_REQUEST_STATUS } from './appointmentManage.js';
import { getClinicTimezone, normalizeClinicId, selectCompanyConfigForClinic, CLINIC_OXYGENDGL, CLINIC_SHENANDOAH } from './clinicRegistry.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';
import { dispatchStaffConfirmationReplyAlert } from './staffBookingAlert.js';
import { bumpAgendaLiveRev } from './agendaLiveRev.js';
import { localeForClinic } from './i18n.js';
import { insertAuditLog, publicCancelAuditLabels } from './auditLog.js';
import { verifyAppointmentManageToken } from './appointmentManageToken.js';

/**
 * Apply SI/NO to a known appointment (SMS inbound or staff manual).
 */
export async function applyConfirmationReplyToAppointment({
  supabase,
  clinicName,
  appointment,
  reply,
  replyText = '',
  source = 'sms',
}) {
  const clinicId = normalizeClinicId(clinicName);
  if (!appointment?.id) return { ok: false, error: 'not_found' };
  if (reply !== 'confirmed' && reply !== 'declined') {
    return { ok: false, error: 'unrecognized_reply' };
  }

  const nextStatus = reply === 'confirmed'
    ? CONFIRMATION_STATUS.CONFIRMED
    : CONFIRMATION_STATUS.DECLINED;

  const timezone = getClinicTimezone(clinicId);
  const locale = localeForClinic(clinicId);
  const stamp = new Date().toLocaleString(locale === 'en' ? 'en-US' : 'es-MX', {
    timeZone: timezone,
  });

  const declineNote = reply === 'declined'
    ? (source === 'staff'
      ? `[STAFF ${stamp}] Marcó NO — cancelación pendiente de aprobación.`
      : source === 'link'
        ? `[PACIENTE ENLACE ${stamp}] Tocó NO — cancelación pendiente de aprobación del staff.`
        : `[PACIENTE SMS ${stamp}] Respondió NO — cancelación pendiente de aprobación del staff.`)
    : null;
  const newNotes = declineNote
    ? (appointment.notes ? `${appointment.notes}\n${declineNote}` : declineNote)
    : undefined;

  const { data: updated, error: updateErr } = await supabase
    .from('appointments')
    .update({
      confirmation_status: nextStatus,
      confirmation_replied_at: new Date().toISOString(),
      confirmation_reply: String(replyText || '').trim().slice(0, 160),
      ...(reply === 'declined'
        ? {
          check_in_status: CANCEL_REQUEST_STATUS,
          ...(newNotes ? { notes: newNotes } : {}),
        }
        : {}),
    })
    .eq('id', appointment.id)
    .in('confirmation_status', [CONFIRMATION_STATUS.PENDING, CONFIRMATION_STATUS.NO_RESPONSE])
    .select('id, confirmation_status, confirmation_reply, confirmation_replied_at, check_in_status')
    .maybeSingle();

  if (updateErr) throw updateErr;
  if (!updated?.id) {
    return { ok: false, error: 'already_replied_or_missing' };
  }

  await bumpAgendaLiveRev(supabase, clinicId).catch(() => null);

  if (source === 'sms') {
    const [{ data: companyConfig }, { data: staffRoster }] = await Promise.all([
      selectCompanyConfigForClinic(supabase, clinicId),
      supabase
        .from('users_staff')
        .select('name, email, phone, notify_on_booking, is_active')
        .eq('is_active', true),
    ]);

    await dispatchStaffConfirmationReplyAlert({
      companyConfig: companyConfig || {},
      staffRoster: staffRoster || [],
      clinicName: clinicId,
      clinicDisplayName: companyConfig?.name,
      patientName: appointment.patient,
      date: appointment.full_date,
      time: appointment.time,
      equipment: appointment.equipment,
      locale,
      reply,
      replyText,
    }).catch(() => null);
  }

  const changedByLabel = source === 'staff'
    ? 'Staff'
    : source === 'link'
      ? (locale === 'en' ? 'Patient (link)' : 'Paciente (enlace)')
      : (locale === 'en' ? 'Patient (SMS)' : 'Paciente (SMS)');

  if (reply === 'confirmed') {
    await insertAuditLog(supabase, {
      appointmentId: appointment.id,
      patientName: appointment.patient,
      action: locale === 'en'
        ? (source === 'staff' ? 'CONFIRMATION STAFF (YES)' : source === 'link' ? 'CONFIRMATION LINK (YES)' : 'CONFIRMATION SMS (YES)')
        : (source === 'staff' ? 'CONFIRMACIÓN STAFF (SI)' : source === 'link' ? 'CONFIRMACIÓN ENLACE (SI)' : 'CONFIRMACIÓN SMS (SI)'),
      changedBy: changedByLabel,
      details: `${appointment.full_date} ${appointment.time} · ${appointment.equipment || ''} · reply: ${String(replyText || '').trim().slice(0, 40)}`,
    });
  } else {
    const cancelSource = source === 'staff' ? 'staff_no' : source === 'link' ? 'link_no' : 'sms_no';
    const cancelAudit = publicCancelAuditLabels(locale, cancelSource);
    await insertAuditLog(supabase, {
      appointmentId: appointment.id,
      patientName: appointment.patient,
      action: cancelAudit.action,
      changedBy: cancelAudit.changedBy,
      details: `Pending approval · ${appointment.full_date} ${appointment.time} · ${appointment.equipment || ''} · reply: ${String(replyText || '').trim().slice(0, 40)}`,
    });
  }

  return {
    ok: true,
    reply,
    appointment,
    nextStatus,
    updated,
  };
}

/**
 * Process a YES/NO (or SI/NO) confirmation reply for a clinic by phone match.
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
    .in('confirmation_status', [CONFIRMATION_STATUS.PENDING, CONFIRMATION_STATUS.NO_RESPONSE]);
  if (error) throw error;

  const match = findPendingConfirmationByPhone({
    appointments: (appointments || []).map((a) => ({
      ...a,
      // findPending only looks at PENDING; include NO_RESPONSE for late replies
      confirmation_status: a.confirmation_status === CONFIRMATION_STATUS.NO_RESPONSE
        ? CONFIRMATION_STATUS.PENDING
        : a.confirmation_status,
    })),
    phone: fromPhone,
    timezone,
  });

  // Restore real appointment row for update
  const appointment = match
    ? (appointments || []).find((a) => String(a.id) === String(match.id)) || match
    : null;

  if (!appointment) {
    return { ok: false, error: 'no_pending', reply };
  }

  return applyConfirmationReplyToAppointment({
    supabase,
    clinicName: clinicId,
    appointment,
    reply,
    replyText: bodyText,
    source: 'sms',
  });
}

/**
 * One-tap link confirmation: long signed token OR short confirmation_code.
 */
export async function applyConfirmationReplyFromToken({ token, replyRaw }) {
  const reply = parseConfirmationReply(replyRaw)
    || (['si', 'yes', '1', 'confirmed'].includes(String(replyRaw || '').trim().toLowerCase()) ? 'confirmed' : null)
    || (['no', '0', 'declined'].includes(String(replyRaw || '').trim().toLowerCase()) ? 'declined' : null);
  if (!reply) {
    return { ok: false, error: 'unrecognized_reply', reply: null };
  }

  const shortCode = String(token || '').trim();
  // Short codes are ~8 chars base64url without a dot; signed tokens contain ".".
  if (shortCode && !shortCode.includes('.') && shortCode.length <= 24) {
    return applyConfirmationReplyFromShortCode({ code: shortCode, reply });
  }

  const claims = verifyAppointmentManageToken(token);
  if (!claims?.appointmentId) {
    return { ok: false, error: 'invalid_token', reply: null };
  }

  const clinicId = normalizeClinicId(claims.clinicName);
  const supabase = getSupabaseAdmin(clinicId);
  const { data: appointment, error } = await supabase
    .from('appointments')
    .select('id, patient, phone, time, full_date, equipment, confirmation_status, notes, check_in_status')
    .eq('id', claims.appointmentId)
    .maybeSingle();
  if (error) throw error;
  if (!appointment) return { ok: false, error: 'not_found', reply };

  return finalizeLinkConfirmation({ supabase, clinicId, appointment, reply });
}

export async function applyConfirmationReplyFromShortCode({ code, reply }) {
  const shortCode = String(code || '').trim();
  if (!shortCode) return { ok: false, error: 'invalid_token', reply: null };

  const clinics = [CLINIC_OXYGENDGL, CLINIC_SHENANDOAH].filter(Boolean);
  // Prefer GDL first for MX traffic.
  let appointment = null;
  let clinicId = null;
  let supabase = null;
  for (const clinic of clinics) {
    try {
      const client = getSupabaseAdmin(clinic);
      const { data, error } = await client
        .from('appointments')
        .select('id, patient, phone, time, full_date, equipment, confirmation_status, notes, check_in_status, confirmation_code')
        .eq('confirmation_code', shortCode)
        .maybeSingle();
      if (error && /column|schema cache|confirmation_code/i.test(error.message || '')) {
        return { ok: false, error: 'invalid_token', reply: null };
      }
      if (error) throw error;
      if (data?.id) {
        appointment = data;
        clinicId = normalizeClinicId(clinic);
        supabase = client;
        break;
      }
    } catch (err) {
      if (/Missing Supabase admin credentials/i.test(err?.message || '')) continue;
      throw err;
    }
  }
  if (!appointment || !supabase) {
    return { ok: false, error: 'invalid_token', reply: null };
  }
  return finalizeLinkConfirmation({ supabase, clinicId, appointment, reply });
}

async function finalizeLinkConfirmation({ supabase, clinicId, appointment, reply }) {
  const status = appointment.confirmation_status || CONFIRMATION_STATUS.NONE;
  if (status === CONFIRMATION_STATUS.CONFIRMED || status === CONFIRMATION_STATUS.DECLINED) {
    return {
      ok: true,
      already: true,
      reply: status === CONFIRMATION_STATUS.CONFIRMED ? 'confirmed' : 'declined',
      nextStatus: status,
      appointment,
    };
  }
  if (status !== CONFIRMATION_STATUS.PENDING && status !== CONFIRMATION_STATUS.NO_RESPONSE) {
    if (status !== CONFIRMATION_STATUS.NONE) {
      return { ok: false, error: 'not_waiting', reply, appointment };
    }
  }

  if (status === CONFIRMATION_STATUS.NONE) {
    await supabase
      .from('appointments')
      .update({
        confirmation_status: CONFIRMATION_STATUS.PENDING,
        confirmation_enabled: true,
        confirmation_sent_at: new Date().toISOString(),
      })
      .eq('id', appointment.id)
      .eq('confirmation_status', CONFIRMATION_STATUS.NONE);
    appointment.confirmation_status = CONFIRMATION_STATUS.PENDING;
  }

  return applyConfirmationReplyToAppointment({
    supabase,
    clinicName: clinicId,
    appointment,
    reply,
    replyText: reply === 'confirmed' ? 'SI (enlace)' : 'NO (enlace)',
    source: 'link',
  });
}
