import { ensurePatient, formatPhoneDisplay } from './ensurePatient.js';
import { buildPortalBookingNotes, fetchPromoters, resolvePromoter } from './promoters.js';
import { PUBLIC_SESSION } from './sessionPresets.js';

export async function submitPublicBooking({
  supabase,
  clinicName,
  portalTag,
  formData,
  selectedService,
  selectedDate,
  selectedTime,
}) {
  const cleanPhone = String(formData.phone || '').replace(/\D/g, '');
  if (cleanPhone.length !== 10) {
    return { error: new Error('PHONE_LENGTH') };
  }

  const phoneDisplay = formatPhoneDisplay(formData.lada, cleanPhone);
  const promoterList = await fetchPromoters(supabase, clinicName);
  const promoter = resolvePromoter(formData.promoterCode, promoterList);

  const patientResult = await ensurePatient(supabase, {
    name: formData.name.trim(),
    phone: phoneDisplay,
    email: formData.email.trim(),
    protocol: 'Wellness',
    notes: promoter.noteLine || '',
    prefers_email: true,
    prefers_sms: true,
  });

  if (patientResult.error) {
    return { error: patientResult.error };
  }

  const targetDateObj = new Date(`${selectedDate}T12:00:00`);
  const dayName = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][targetDateObj.getDay()];

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
    notes: buildPortalBookingNotes({ portalTag, promoter, userNotes: formData.notes }),
  };

  const { error } = await supabase.from('appointments').insert([payload]);
  if (error) {
    return { error };
  }

  return {
    ok: true,
    patient: patientResult,
    promoter,
  };
}
