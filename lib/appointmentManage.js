import { appointmentStartMs } from './appointmentConfirmation.js';
import { getClinicTimezone, isShenandoah, normalizeClinicId } from './clinicRegistry.js';
import { localeForClinic } from './i18n.js';
import { digitsOnly } from './ensurePatient.js';

const CLOSED_STATUSES = new Set([
  'Cancelado',
  'Finalizado',
  'Devuelto',
  'No Asistió',
  'Falta Justificada',
  'Completed',
  'Cancelled',
]);

export function hoursUntilAppointment(fullDate, time, clinicName) {
  const start = appointmentStartMs(fullDate, time, getClinicTimezone(clinicName));
  if (start == null || Number.isNaN(start)) return null;
  return (start - Date.now()) / (1000 * 60 * 60);
}

/**
 * Patient may self-cancel/reschedule only when there are at least
 * cancelLimitHours remaining before the appointment start.
 */
export function evaluatePatientSelfManage({
  appointment,
  clinicName,
  cancelLimitHours = 24,
} = {}) {
  const locale = localeForClinic(clinicName);
  const es = locale !== 'en';
  const status = String(appointment?.check_in_status || '');
  const limit = Math.max(1, Number(cancelLimitHours) || 24);

  if (!appointment?.id) {
    return { ok: false, reason: 'not_found', limit, locale };
  }
  if (CLOSED_STATUSES.has(status)) {
    return {
      ok: false,
      reason: 'closed',
      hours: null,
      limit,
      locale,
      message: es
        ? 'Esta cita ya no se puede modificar en línea.'
        : 'This appointment can no longer be changed online.',
    };
  }

  const hours = hoursUntilAppointment(appointment.full_date, appointment.time, clinicName);
  if (hours == null) {
    return {
      ok: false,
      reason: 'invalid',
      hours: null,
      limit,
      locale,
      message: es ? 'No se pudo validar la fecha de la cita.' : 'Could not validate the appointment time.',
    };
  }

  if (hours < limit) {
    return {
      ok: false,
      reason: 'too_soon',
      hours,
      limit,
      locale,
      message: es
        ? `Faltan menos de ${limit} horas para tu cita. Para cancelar o reprogramar, llámanos directamente.`
        : `There are fewer than ${limit} hours left before your appointment. To cancel or reschedule, please call us directly.`,
    };
  }

  return {
    ok: true,
    hours,
    limit,
    locale,
    message: es
      ? 'Puedes cancelar o reprogramar en línea.'
      : 'You can cancel or reschedule online.',
  };
}

export function formatClinicPhoneForPatient(phone, clinicName) {
  const last10 = digitsOnly(phone).slice(-10);
  if (last10.length !== 10) return String(phone || '').trim();
  if (isShenandoah(clinicName)) return last10;
  return `${last10.slice(0, 2)} ${last10.slice(2, 6)} ${last10.slice(6)}`;
}

export function publicAppointmentView(row) {
  if (!row) return null;
  return {
    id: row.id,
    patient: row.patient,
    phone: row.phone,
    email: row.email,
    full_date: row.full_date,
    time: row.time,
    equipment: row.equipment,
    duration: row.duration,
    buffer: row.buffer,
    check_in_status: row.check_in_status,
    clinic: normalizeClinicId(row.clinic),
  };
}
