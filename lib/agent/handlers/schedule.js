import { phoneLast10, normalizeAppointmentRow, extractPatientSearchQuery } from '../parseParams.js';
import { ensurePatient, normalizeStr } from '../../ensurePatient.js';
import { insertStaffAppointment, updateAppointmentNotesAndContact, updateStaffAppointment } from '../../staffAppointmentSave.js';
import { resolveScreenshotEquipment } from '../../screenshotEquipment.js';
import { normalizeAppointmentTime } from '../../screenshotAppointmentParse.js';
import { requireClinic } from '../agentServices.js';
import { AGENT_TOOL_IDS } from '../constants.js';

function es(locale, esText, enText) {
  return locale === 'en' ? enText : esText;
}

function formatPatientList(patients, locale) {
  if (!patients.length) return es(locale, 'No encontré pacientes.', 'No patients found.');
  return patients.map((p, i) =>
    `${i + 1}. ${p.patient} · ${p.phone || 'sin tel'}${p.is_blocked ? ' · BLOQUEADO' : ''}`,
  ).join('\n');
}

function formatSchedule(appointments, locale, dateLabel) {
  if (!appointments.length) {
    return es(locale, `Sin citas para ${dateLabel}.`, `No appointments for ${dateLabel}.`);
  }
  const lines = appointments.map((a) =>
    `• ${a.time} · ${a.patient} · ${a.equipment} · ${a.check_in_status}`,
  );
  return `${es(locale, 'Agenda', 'Schedule')} ${dateLabel}:\n${lines.join('\n')}`;
}

export async function handleSearchPatient({ ctx, params, services, locale }) {
  requireClinic(ctx, services);
  const q = (params.patient || params.phone || extractPatientSearchQuery(params.query || '')).trim();
  const patients = await services.listPatients({ search: q });
  return {
    ok: true,
    reply: `${es(locale, 'Resultados', 'Results')}:\n${formatPatientList(patients, locale)}`,
    data: { patients },
  };
}

export async function handleViewTodaySchedule({ ctx, params, services, locale }) {
  requireClinic(ctx, services);
  const date = params.fullDate || services.clinicToday();
  const appointments = await services.listAppointments({ fullDate: date });
  return {
    ok: true,
    reply: formatSchedule(appointments, locale, date),
    data: { date, appointments },
  };
}

export async function handleViewAppointment({ ctx, params, services, locale }) {
  requireClinic(ctx, services);
  if (params.appointmentId) {
    const app = await services.getAppointmentById(params.appointmentId);
    if (!app) return { ok: false, error: 'not_found', message: es(locale, 'Cita no encontrada.', 'Appointment not found.') };
    return {
      ok: true,
      reply: `• ${app.time} · ${app.patient}\n  ${app.equipment} · ${app.check_in_status}\n  ${app.notes || ''}`.trim(),
      data: { appointment: app },
    };
  }
  const date = params.fullDate || services.clinicToday();
  const apps = await services.listAppointments({ fullDate: date, patient: params.patient });
  if (!apps.length) {
    return { ok: false, error: 'not_found', message: es(locale, 'No encontré esa cita.', 'Appointment not found.') };
  }
  if (apps.length === 1) {
    const app = apps[0];
    return {
      ok: true,
      reply: `• ${app.time} · ${app.patient} · ${app.equipment} · ${app.check_in_status}`,
      data: { appointment: app },
    };
  }
  return {
    ok: true,
    reply: `${es(locale, 'Varias citas', 'Multiple appointments')}:\n${apps.map((a) => `• ${a.time} · ${a.patient} · ${a.equipment}`).join('\n')}`,
    data: { appointments: apps },
  };
}

export async function handleCheckAvailability({ ctx, params, services, locale }) {
  requireClinic(ctx, services);
  const date = params.fullDate || services.clinicToday();
  const allServices = await services.listServices();
  const equipmentName = resolveScreenshotEquipment({
    clinic: services.clinic,
    services: allServices,
    ocrText: params.equipment || params.query,
  }) || services.defaultEquipment(allServices);
  const busy = await services.listAppointments({ fullDate: date });
  const onEquipment = busy.filter((a) => normalizeStr(a.equipment) === normalizeStr(equipmentName));
  return {
    ok: true,
    reply: es(
      locale,
      `${date} · ${equipmentName}: ${onEquipment.length} cita(s) ocupadas.\n${onEquipment.map((a) => `• ${a.time} ${a.patient}`).join('\n') || 'Sin citas aún.'}`,
      `${date} · ${equipmentName}: ${onEquipment.length} booking(s).\n${onEquipment.map((a) => `• ${a.time} ${a.patient}`).join('\n') || 'No bookings yet.'}`,
    ),
    data: { date, equipment: equipmentName, busy: onEquipment },
  };
}

export async function handleBookAppointment({ ctx, params, services, locale }) {
  requireClinic(ctx, services);
  const missing = [];
  if (!params.patient) missing.push(es(locale, 'nombre del paciente', 'patient name'));
  if (!params.fullDate) missing.push(es(locale, 'fecha', 'date'));
  if (!params.time) missing.push(es(locale, 'hora', 'time'));
  if (missing.length) {
    return {
      ok: false,
      error: 'validation_failed',
      message: es(
        locale,
        `Para agendar necesito: ${missing.join(', ')}. Ej: "agendar María López mañana 10:30" o usa 📷 Captura.`,
        `To book I need: ${missing.join(', ')}. Example: "book Maria Lopez tomorrow 10:30 AM" or use screenshot capture.`,
      ),
    };
  }

  const allServices = await services.listServices();
  const equipment = resolveScreenshotEquipment({
    clinic: services.clinic,
    services: allServices,
    ocrText: params.equipment || params.query,
  }) || services.defaultEquipment(allServices);
  const srv = allServices.find((s) => normalizeStr(s.name) === normalizeStr(equipment)) || allServices[0];
  if (!srv) {
    return { ok: false, error: 'validation_failed', message: es(locale, 'No hay servicios activos.', 'No active services.') };
  }

  const phoneDigits = phoneLast10(params.phone);
  let patientName = params.patient.trim();
  let phone = params.phone || '';
  let email = '';

  if (phoneDigits.length === 10) {
    const ensured = await ensurePatient(services.supabase, {
      name: patientName,
      phone: params.phone,
      email: '',
      protocol: 'Wellness',
    });
    if (ensured.error) {
      return { ok: false, error: 'execution_failed', message: ensured.error.message };
    }
    patientName = ensured.displayName;
    phone = ensured.phone;
    email = ensured.email || '';
  } else {
    const existing = (await services.listPatients({ search: patientName, limit: 5 }))
      .find((p) => normalizeStr(p.patient) === normalizeStr(patientName));
    if (existing) {
      phone = existing.phone;
      email = existing.email || '';
    } else {
      return {
        ok: false,
        error: 'validation_failed',
        message: es(locale, 'Paciente nuevo requiere teléfono de 10 dígitos.', 'New patients need a 10-digit phone.'),
      };
    }
  }

  const time = normalizeAppointmentTime(params.time);
  const payload = {
    patient: patientName,
    phone,
    email,
    equipment: srv.name,
    duration: Number(srv.duration) || 60,
    buffer: Number(srv.buffer ?? 30),
    time,
    appointment_time: time,
    full_date: params.fullDate,
    appointment_date: params.fullDate,
    attendant: ctx.staffName || 'Por Asignar',
    check_in_status: 'Agendado',
    is_new_patient: false,
    notes: `[AGENTE] Agendado por ${ctx.staffName || 'staff'}`,
    clinic: services.clinic,
  };

  const { data, error } = await insertStaffAppointment(services.supabase, payload);
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('SLOT_UNAVAILABLE')) {
      return { ok: false, error: 'validation_failed', message: es(locale, 'Horario no disponible.', 'Slot unavailable.') };
    }
    return { ok: false, error: 'execution_failed', message: msg };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: true,
    reply: es(
      locale,
      `✓ Cita agendada: ${patientName} · ${params.fullDate} ${time} · ${srv.name}`,
      `✓ Booked: ${patientName} · ${params.fullDate} ${time} · ${srv.name}`,
    ),
    data: { appointment: normalizeAppointmentRow(row) },
  };
}

export async function handleUpdateAppointmentNotes({ ctx, params, services, locale }) {
  requireClinic(ctx, services);
  const noteMatch = params.query.match(/nota[s]?\s*[:]\s*(.+)$/i);
  const notes = noteMatch?.[1]?.trim();
  if (!params.appointmentId && !params.patient) {
    return { ok: false, error: 'validation_failed', message: es(locale, 'Indica paciente o id de cita.', 'Provide patient or appointment id.') };
  }
  if (!notes) {
    return { ok: false, error: 'validation_failed', message: es(locale, 'Escribe la nota así: "nota: texto"', 'Write note as: "nota: text"') };
  }
  let app = null;
  if (params.appointmentId) {
    app = await services.getAppointmentById(params.appointmentId);
  } else {
    const apps = await services.listAppointments({
      fullDate: params.fullDate || services.clinicToday(),
      patient: params.patient,
    });
    app = apps[0];
  }
  if (!app) return { ok: false, error: 'not_found', message: es(locale, 'Cita no encontrada.', 'Appointment not found.') };

  const merged = [app.notes, notes].filter(Boolean).join('\n');
  const { error } = await updateAppointmentNotesAndContact(services.supabase, app.id, { notes: merged });
  if (error) return { ok: false, error: 'execution_failed', message: error.message };

  return {
    ok: true,
    reply: es(locale, `Notas actualizadas para ${app.patient}.`, `Notes updated for ${app.patient}.`),
    data: { appointmentId: app.id },
  };
}

export async function handleCancelAppointment({ ctx, params, services, locale }) {
  requireClinic(ctx, services);
  let app = null;
  if (params.appointmentId) {
    app = await services.getAppointmentById(params.appointmentId);
  } else {
    const apps = await services.listAppointments({
      fullDate: params.fullDate || services.clinicToday(),
      patient: params.patient,
    });
    app = apps.find((a) => !params.time || normalizeStr(a.time) === normalizeStr(params.time)) || apps[0];
  }
  if (!app) return { ok: false, error: 'not_found', message: es(locale, 'Cita no encontrada.', 'Appointment not found.') };

  const { error } = await updateStaffAppointment(services.supabase, app.id, {
    check_in_status: 'Cancelado',
    notes: [app.notes, `[AGENTE] Cancelado por ${ctx.staffName || 'staff'}`].filter(Boolean).join('\n'),
  }, { skipSlotCheck: true });

  if (error) return { ok: false, error: 'execution_failed', message: error.message };

  return {
    ok: true,
    reply: es(locale, `Cita cancelada: ${app.patient} · ${app.full_date} ${app.time}`, `Cancelled: ${app.patient} · ${app.full_date} ${app.time}`),
    data: { appointmentId: app.id },
  };
}

export const SCHEDULE_HANDLERS = {
  [AGENT_TOOL_IDS.SEARCH_PATIENT]: handleSearchPatient,
  [AGENT_TOOL_IDS.VIEW_TODAY_SCHEDULE]: handleViewTodaySchedule,
  [AGENT_TOOL_IDS.VIEW_APPOINTMENT]: handleViewAppointment,
  [AGENT_TOOL_IDS.CHECK_AVAILABILITY]: handleCheckAvailability,
  [AGENT_TOOL_IDS.BOOK_APPOINTMENT]: handleBookAppointment,
  [AGENT_TOOL_IDS.UPDATE_APPOINTMENT_NOTES]: handleUpdateAppointmentNotes,
  [AGENT_TOOL_IDS.CANCEL_APPOINTMENT]: handleCancelAppointment,
};
