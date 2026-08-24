import { ensurePatient, findExistingPatientByPhone, formatPhoneDisplay } from './ensurePatient.js';
import { SLOT_UNAVAILABLE, validateAppointmentSlot } from './appointmentSlotGuard.js';
import { getDayNameFromDate, localeForClinic } from './i18n.js';
import { normalizeClinicId, isShenandoah } from './clinicRegistry.js';
import { buildPortalBookingNotes, fetchPromoters, resolvePromoter } from './promoters.js';
import { PUBLIC_SESSION } from './sessionPresets.js';
import { insertStaffAppointment } from './staffAppointmentSave.js';
import { insertAuditLog, publicBookingAuditLabels } from './auditLog.js';

export async function submitPublicBooking({
  supabase,
  clinicName,
  portalTag,
  formData,
  selectedService,
  selectedDate,
  selectedTime,
  locale: localeOverride,
}) {
  const clinicId = normalizeClinicId(clinicName);
  const locale = localeOverride || localeForClinic(clinicId);
  const cleanPhone = String(formData.phone || '').replace(/\D/g, '');
  if (cleanPhone.length !== 10) {
    return { error: new Error('PHONE_LENGTH') };
  }

  const phoneDisplay = formatPhoneDisplay(formData.lada, cleanPhone);
  const existingChart = await findExistingPatientByPhone(supabase, phoneDisplay);
  if (existingChart?.is_blocked) {
    return { error: new Error('PATIENT_BLOCKED') };
  }

  const promoterList = await fetchPromoters(supabase, clinicName);
  const promoter = resolvePromoter(formData.promoterCode, promoterList);

  const patientResult = await ensurePatient(supabase, {
    name: formData.name.trim(),
    phone: phoneDisplay,
    email: formData.email.trim(),
    protocol: 'Wellness',
    notes: buildPortalBookingNotes({ portalTag, promoter, userNotes: '', locale }),
    prefers_email: true,
    prefers_sms: formData.smsConsent === true,
    prefers_sms_reminder: true,
  });

  if (patientResult.error) {
    return { error: patientResult.error };
  }

  if (patientResult.is_blocked) {
    return { error: new Error('PATIENT_BLOCKED') };
  }

  const targetDateObj = new Date(`${selectedDate}T12:00:00`);
  const dayName = getDayNameFromDate(locale, targetDateObj);

  const payload = {
    patient: patientResult.displayName,
    phone: patientResult.phone,
    email: patientResult.email,
    protocol: 'Wellness',
    equipment: selectedService.name,
    duration: PUBLIC_SESSION.duration,
    buffer: PUBLIC_SESSION.buffer,
    full_date: selectedDate,
    appointment_date: selectedDate,
    day: dayName,
    time: selectedTime,
    appointment_time: selectedTime,
    attendant: 'Por Asignar',
    check_in_status: 'Agendado',
    is_new_patient: patientResult.isNew,
    notes: buildPortalBookingNotes({
      portalTag,
      promoter,
      userNotes: formData.notes,
      locale,
      smsConsent: isShenandoah(clinicId) ? formData.smsConsent === true : undefined,
    }),
    promoter_code: promoter.code || null,
    clinic: clinicId,
  };

  const slotCheck = await validateAppointmentSlot(supabase, payload, { clinicName: clinicId });
  if (!slotCheck.ok) {
    if (slotCheck.code === SLOT_UNAVAILABLE) {
      return { error: new Error(SLOT_UNAVAILABLE) };
    }
    return { error: slotCheck.error || new Error('SLOT_CHECK_FAILED') };
  }

  const { data, error } = await insertStaffAppointment(supabase, payload, { skipSlotCheck: true });
  if (error) {
    return { error };
  }

  const appointment = Array.isArray(data) ? data[0] : data;
  try {
    const { bumpAgendaLiveRev } = await import('./agendaLiveRev.js');
    await bumpAgendaLiveRev(supabase, clinicId);
  } catch {
    /* optional until agenda_rev column exists */
  }

  const audit = publicBookingAuditLabels(locale);
  const promo = promoter?.code ? ` · promotor ${promoter.code}` : '';
  await insertAuditLog(supabase, {
    appointmentId: appointment?.id || null,
    patientName: patientResult.displayName,
    action: audit.action,
    changedBy: audit.changedBy,
    details: `${selectedDate} ${selectedTime} · ${selectedService.name}${promo}${patientResult.isNew ? ' · paciente nuevo' : ''}`,
  });

  return {
    ok: true,
    patient: patientResult,
    promoter,
    appointment: appointment || null,
  };
}
