#!/usr/bin/env node
/**
 * Simulaciones rápidas de lógica crítica (sin BD).
 * node scripts/simulate-user-flows.mjs
 */

import assert from 'node:assert/strict';
import { resolvePatientForAppointment, chooseDuplicatePhoneAction } from '../lib/ensurePatient.js';
import { mergeStaffAlertRecipients } from '../lib/staffBookingAlert.js';
import {
  isSystemImportNote,
  sanitizePatientNotesForDisplay,
} from '../lib/patientNotes.js';
import {
  isStaleAppointmentPatientName,
  withCanonicalPatientName,
} from '../lib/patientNameSync.js';
import { isFirstSessionAppointment } from '../lib/emailTemplates.js';
import { isSmsOptOutKeyword, appointmentHasSmsOptOut } from '../lib/smsOptOut.js';
import { resolveReminderHours } from '../lib/notifySettings.js';
import {
  ACTIVE_CLINICS,
  CLINIC_OXYGENDGL,
  CLINIC_OXYGENDGL2,
  CLINIC_SHENANDOAH,
  isClinicEnabled,
  isPublicClinic,
} from '../lib/clinicRegistry.js';
import {
  normalizeAppointmentDate,
  normalizeAppointmentTime,
  normalizeScreenshotExtraction,
  parseAppointmentFromOcrText,
  parseVisionJsonContent,
  parseWeekdayDayFromText,
} from '../lib/screenshotAppointmentParse.js';
import {
  defaultEquipmentForClinic,
  extractEquipmentFromText,
  resolveScreenshotEquipment,
} from '../lib/screenshotEquipment.js';
import { getAllowedClinics, normalizeStaffSessionUser } from '../lib/clinicAccess.js';
import { getMissingAppointmentFields, resolveAppointmentDraft } from '../lib/appointmentFormValidation.js';
import { isAssessmentService } from '../lib/assessmentService.js';
import { buildSessionSummary, formatSessionSummaryLines } from '../lib/sessionSummary.js';
import {
  appointmentStartMs,
  explainConfirmationState,
  CONFIRMATION_STATUS,
} from '../lib/appointmentConfirmation.js';
import { buildPromoterNoShowEmail } from '../lib/promoterNoShowNotify.js';
import { reverseNoShowWalletImpact, adjustWalletSessions } from '../lib/sessionWallet.js';
import { normalizeClientIp } from '../lib/requestClientIp.js';
import { buildPatientSmsMessage } from '../lib/patientStaffSms.js';
import { isAppointmentInReminderWindow } from '../lib/appointmentReminder.js';
import { canAutoLoginWithoutPin, hashClientIp } from '../lib/staffDeviceTrust.js';
import { resolveNotifyChannels, resolveNotifyChannelsForPatient } from '../lib/notifySettings.js';
import {
  getPreviousWeekRange,
  summarizeSalesRows,
} from '../lib/weeklySalesReport.js';
import { isMondayInTimezone } from '../lib/dailyCron.js';
import { PAYMENT_METHOD_KEYS } from '../lib/paymentMethod.js';

process.env.STAFF_SESSION_SECRET = process.env.STAFF_SESSION_SECRET || 'test-secret-for-simulations';
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('\nSimulación de flujos de usuario\n');

test('renombrar paciente: cita vieja se vincula por teléfono (GDL)', () => {
  const patients = [{ id: '1', patient: 'Maria de Jesus', phone: '+52 3311111111' }];
  const app = { patient: 'Maria vera', phone: '+52 3311111111' };
  const pat = resolvePatientForAppointment(app, patients);
  assert.equal(pat?.id, '1');
  assert.equal(pat?.patient, 'Maria de Jesus');
});

test('renombrar paciente: misma lógica en Houston (TX)', () => {
  const patients = [{ id: 'tx1', patient: 'John Smith', phone: '7135551212' }];
  const app = { patient: 'Jon Smith', phone: '7135551212' };
  const pat = resolvePatientForAppointment(app, patients);
  assert.equal(pat?.id, 'tx1');
});

test('calendario muestra nombre canónico aunque cita tenga nombre viejo', () => {
  const patients = [{ id: '1', patient: 'Maria de Jesus', phone: '3311111111' }];
  const app = { id: 'a1', patient: 'Maria vera', phone: '3311111111' };
  const shown = withCanonicalPatientName(app, patients);
  assert.equal(shown.patient, 'Maria de Jesus');
});

test('detecta nombre desincronizado en cita activa', () => {
  const app = { patient: 'Maria vera', phone: '3311111111' };
  const pat = { patient: 'Maria de Jesus', phone: '3311111111' };
  assert.equal(isStaleAppointmentPatientName(app, pat), true);
  assert.equal(isStaleAppointmentPatientName(app, { patient: 'Maria vera' }), false);
});

test('notas Setmore se ocultan en expediente', () => {
  assert.equal(isSystemImportNote('import-setmore-gdl · setmore:abc'), true);
  assert.equal(sanitizePatientNotesForDisplay('import-setmore-gdl · setmore:abc'), '');
  assert.equal(
    sanitizePatientNotesForDisplay('Diabético\nimport-setmore-gdl'),
    'Diabético',
  );
});

test('notas clínicas reales no se borran', () => {
  const note = 'Precaución con oídos · alérgico a latex';
  assert.equal(sanitizePatientNotesForDisplay(note), note);
});

test('alertas staff GDL: solo teléfono clínica + opt-in', () => {
  const { phones, emails } = mergeStaffAlertRecipients(
    { staff_alert_phones: '3312345678', staff_alert_emails: 'clinica@test.com' },
    [
      { is_active: true, notify_on_booking: true, phone: '3399999999', email: 'staff@test.com' },
      { is_active: true, notify_on_booking: false, phone: '3388888888', email: 'otro@test.com' },
      { is_active: true, phone: '3377777777', email: 'sinflag@test.com' },
    ],
    CLINIC_OXYGENDGL,
  );
  assert.ok(phones.some((p) => p.includes('3312345678')));
  assert.ok(phones.some((p) => p.includes('3399999999')));
  assert.equal(phones.filter((p) => p.includes('3388888888')).length, 0);
  assert.ok(emails.includes('clinica@test.com'));
  assert.ok(emails.includes('staff@test.com'));
});

test('alertas staff Houston: misma regla opt-in', () => {
  const { phones } = mergeStaffAlertRecipients(
    { staff_alert_phones: '2815550100', staff_alert_emails: 'houston@test.com' },
    [
      { is_active: true, notify_on_booking: true, phone: '2815559999', email: 'tx@test.com' },
      { is_active: true, notify_on_booking: false, phone: '2815558888', email: 'no@test.com' },
    ],
    CLINIC_SHENANDOAH,
  );
  assert.ok(phones.some((p) => p.includes('2815550100')));
  assert.ok(phones.some((p) => p.includes('2815559999')));
  assert.equal(phones.filter((p) => p.includes('2815558888')).length, 0);
});

test('GDL2 bloqueada: no es sede pública ni activa', () => {
  assert.equal(isClinicEnabled(CLINIC_OXYGENDGL2), false);
  assert.equal(isPublicClinic(CLINIC_OXYGENDGL2), false);
  assert.equal(ACTIVE_CLINICS.includes(CLINIC_OXYGENDGL2), false);
  assert.ok(ACTIVE_CLINICS.includes(CLINIC_OXYGENDGL));
  assert.ok(ACTIVE_CLINICS.includes(CLINIC_SHENANDOAH));
});

test('acceso staff: maestro ve GDL1 y Houston, no GDL2', () => {
  const master = normalizeStaffSessionUser({
    id: 'admin',
    name: 'Admin',
    allowedClinics: [CLINIC_OXYGENDGL, CLINIC_OXYGENDGL2, CLINIC_SHENANDOAH],
  });
  const allowed = getAllowedClinics(master);
  assert.deepEqual(allowed, [CLINIC_OXYGENDGL, CLINIC_SHENANDOAH]);
});

test('acceso staff GDL: solo Oxygengdl', () => {
  const user = normalizeStaffSessionUser({
    name: 'Recepción',
    allowedClinics: [CLINIC_OXYGENDGL],
    clinicProfiles: { [CLINIC_OXYGENDGL]: { role: 'Recepción' } },
  });
  assert.deepEqual(getAllowedClinics(user), [CLINIC_OXYGENDGL]);
});

test('primera sesión: paciente nuevo en clínica', () => {
  assert.equal(
    isFirstSessionAppointment({
      isNewPatient: true,
      patientName: 'Juan',
      appointments: [],
    }),
    true,
  );
});

test('primera sesión: NO cuenta al rotar de cámara', () => {
  const appointments = [
    { id: 'old', patient: 'Juan', check_in_status: 'Finalizado', equipment: 'CAMARA 1' },
  ];
  assert.equal(
    isFirstSessionAppointment({
      isNewPatient: false,
      patientName: 'Juan',
      equipment: 'CAMARA 2',
      appointments,
      excludeAppointmentId: 'new',
    }),
    false,
  );
});

test('bitácora: paciente encontrado tras rename si hay teléfono', () => {
  const dbPatients = [{ id: 'p1', patient: 'Maria de Jesus', phone: '3311111111', wallets: { price_60: 1 } }];
  const selectedSlot = { patientId: null, patient: 'Maria vera', phone: '3311111111' };
  const pat = (selectedSlot.patientId
    ? dbPatients.find((x) => String(x.id) === String(selectedSlot.patientId))
    : null)
    || dbPatients.find((x) => x.patient === selectedSlot.patient)
    || resolvePatientForAppointment(selectedSlot, dbPatients);
  assert.ok(pat, 'debe encontrar paciente para firmar bitácora');
  assert.equal(pat.id, 'p1');
});

test('bitácora: no confundir id de cita con id de paciente', () => {
  const dbPatients = [{ id: 'p1', patient: 'Ana', phone: '3311223344' }];
  const selectedSlot = { id: 'appt-99', patientId: null, patient: 'Ana', phone: '3311223344' };
  const wrongLookup = dbPatients.find((p) => String(p.id) === String(selectedSlot.id));
  const correct = resolvePatientForAppointment(selectedSlot, dbPatients);
  assert.equal(wrongLookup, undefined);
  assert.equal(correct?.id, 'p1');
});

test('captura WhatsApp: normaliza fecha DD/MM y hora 24h', () => {
  assert.equal(normalizeAppointmentDate('15/07/2026', '2026-07-09'), '2026-07-15');
  assert.equal(normalizeAppointmentTime('14:30'), '02:30 PM');
  assert.equal(normalizeAppointmentTime('9:00 AM'), '09:00 AM');
});

test('captura WhatsApp: mañana y teléfono MX', () => {
  const parsed = normalizeScreenshotExtraction({
    patient: 'Juan Pérez',
    phone: '3312345678',
    date: 'mañana',
    time: '10:30 am',
    equipment: 'CAMARA 2 60 MIN',
    confidence: 'high',
  }, { referenceDate: '2026-07-09', locale: 'es' });
  assert.equal(parsed.patient, 'Juan Pérez');
  assert.equal(parsed.fullDate, '2026-07-10');
  assert.equal(parsed.time, '10:30 AM');
  assert.ok(parsed.phone.includes('3312345678'));
  assert.equal(parsed.ready, true);
});

test('captura: JSON de visión se parsea con markdown', () => {
  const raw = parseVisionJsonContent('```json\n{"patient":"Ana","time":"11:00 AM"}\n```');
  assert.equal(raw.patient, 'Ana');
  assert.equal(raw.time, '11:00 AM');
});

test('OCR WhatsApp: Elizabeth — martes 14 y 4:30', () => {
  const ocr = `
Elizabeth Gonzalez
Buenos días
Quisiera una cita para oxigenación
Martes 14
10:30, 12:00 o 4:30
4:30
`;
  const ex = parseAppointmentFromOcrText(ocr, { referenceDate: '2026-07-09', locale: 'es' });
  assert.equal(ex.patient, 'Elizabeth Gonzalez');
  assert.equal(ex.fullDate, '2026-07-14');
  assert.equal(ex.time, '04:30 PM');
});

test('OCR: martes 14 resuelve día del mes', () => {
  assert.equal(parseWeekdayDayFromText('cita martes 14 por favor', '2026-07-09'), '2026-07-14');
});

const gdlServices = [
  { name: 'CAMARA 1, 60 MIN', is_active: true },
  { name: 'CAMARA 2 60 MIN', is_active: true },
  { name: 'CAMARA 3 60 MIN', is_active: true },
];

test('captura: default GDL → cámara 2', () => {
  assert.equal(defaultEquipmentForClinic(CLINIC_OXYGENDGL, gdlServices), 'CAMARA 2 60 MIN');
});

test('captura: default Houston → cámara 1', () => {
  const txServices = [
    { name: 'Chamber 1 - 60 min', is_active: true },
    { name: 'Chamber 2 - 60 min', is_active: true },
  ];
  assert.equal(defaultEquipmentForClinic(CLINIC_SHENANDOAH, txServices), 'Chamber 1 - 60 min');
});

test('captura: OCR con cámara 3 gana sobre default', () => {
  const eq = resolveScreenshotEquipment({
    clinic: CLINIC_OXYGENDGL,
    services: gdlServices,
    ocrText: 'cita camara 3 el martes',
  });
  assert.equal(eq, 'CAMARA 3 60 MIN');
});

test('captura: OCR sin cámara usa default de clínica', () => {
  const ex = parseAppointmentFromOcrText('Elizabeth Gonzalez martes 14 4:30', {
    referenceDate: '2026-07-09',
    locale: 'es',
    clinic: CLINIC_OXYGENDGL,
    services: gdlServices,
  });
  assert.equal(ex.equipment, 'CAMARA 2 60 MIN');
});

test('captura: extrae cámara del texto', () => {
  assert.equal(
    extractEquipmentFromText('quiero camara 1 por favor', gdlServices),
    'CAMARA 1, 60 MIN',
  );
});

test('cita: detecta hora faltante al agendar desde paciente', () => {
  const missing = getMissingAppointmentFields({
    patient: 'BRENDA FLORES',
    equipment: 'CAMARA 2 60 MIN',
    time: '',
  }, 'es');
  assert.deepEqual(missing, ['hora']);
});

test('cita: ignora evento de clic pasado por error al guardar', () => {
  const selected = {
    patient: 'BRENDA FLORES',
    equipment: 'CAMARA 2 60 MIN',
    time: '12:00 PM',
  };
  const fakeClickEvent = { nativeEvent: {}, target: {} };
  const resolved = resolveAppointmentDraft(fakeClickEvent, selected);
  assert.equal(resolved.patient, 'BRENDA FLORES');
  assert.equal(resolved.time, '12:00 PM');
  assert.deepEqual(getMissingAppointmentFields(resolved, 'es'), []);
});

test('valoración: no entra al pool de sesiones ni adeudo', () => {
  assert.equal(isAssessmentService('VALORACION'), true);
  assert.equal(isAssessmentService('Valoración inicial'), true);
  assert.equal(isAssessmentService('CAMARA 2 60 MIN'), false);
  const summary = buildSessionSummary({
    equipment: 'VALORACION',
    historicoSesiones: 3,
    adeudo: 2,
    wallets: {},
    packageHistory: [],
  });
  assert.equal(summary.isAssessment, true);
  assert.equal(summary.isDebtor, false);
  const lines = formatSessionSummaryLines(summary, {
    assessmentHeadline: 'Valoración (sin cargo de sesión)',
    assessmentDetail: 'No descuenta cartera ni genera adeudo al sellar.',
  });
  assert.match(lines.headline, /Valoración/i);
  assert.equal(lines.tone, 'ok');
  assert.match(lines.thisVisit || '', /valoración/i);
});

test('bitácora: resumen aclara número de esta firma (pagada)', () => {
  const summary = buildSessionSummary({
    equipment: 'MONOPLAZA',
    historicoSesiones: 3,
    adeudo: 0,
    wallets: { MONOPLAZA: 2 },
    packageHistory: [{ sessions: 5, price: 1000 }],
  });
  const lines = formatSessionSummaryLines(summary, {
    thisVisitPaid: (taken, total, thisNum, remaining) =>
      `Ya tomadas: ${taken} de ${total}. Esta firma es la #${thisNum}. Quedan ${remaining} pendientes.`,
  });
  assert.match(lines.thisVisit, /#4/);
  assert.match(lines.thisVisit, /3 de 5/);
  assert.match(lines.thisVisit, /1 pendiente/);
});

test('bitácora: cortesía no avanza el contador', () => {
  const summary = buildSessionSummary({
    equipment: 'MONOPLAZA',
    historicoSesiones: 3,
    adeudo: 0,
    wallets: { MONOPLAZA: 2 },
    packageHistory: [{ sessions: 5, price: 1000 }],
  });
  const lines = formatSessionSummaryLines(summary, {
    thisVisitCourtesy: (taken, total) => `Cortesía: siguen ${taken} de ${total}`,
  }, { skipCharge: true });
  assert.match(lines.thisVisit, /Cortesía/);
  assert.match(lines.thisVisit, /3 de 5/);
});

test('SMS STOP se reconoce como opt-out, no como YES/NO', () => {
  assert.equal(isSmsOptOutKeyword('STOP'), true);
  assert.equal(isSmsOptOutKeyword('stopall'), true);
  assert.equal(isSmsOptOutKeyword('BAJA'), true);
  assert.equal(isSmsOptOutKeyword('YES'), false);
  assert.equal(isSmsOptOutKeyword('NO'), false);
  assert.equal(appointmentHasSmsOptOut({ confirmation_reply: 'STOP' }), true);
  assert.equal(appointmentHasSmsOptOut({ notes: '⟦oxy:sms-opt-out⟧ 2026-08-17' }), true);
});

test('México: recordatorio por defecto 12 h; Houston 24 h si no hay valor', () => {
  assert.equal(resolveReminderHours({}, 'Oxygengdl'), 12);
  assert.equal(resolveReminderHours({ reminder_hours: 24 }, 'Oxygengdl'), 12);
  assert.equal(resolveReminderHours({ reminder_hours: 6 }, 'Oxygengdl'), 6);
  assert.equal(resolveReminderHours({}, 'Shenandoah'), 24);
  assert.equal(resolveReminderHours({ reminder_hours: 6 }, 'Shenandoah'), 6);
});

test('confirmación SMS: ventana flexible tras las 6 h', () => {
  const fullDate = '2026-07-13';
  const time = '12:00 PM';
  const tz = 'America/Chicago';
  const startMs = appointmentStartMs(fullDate, time, tz);
  const sendAt = startMs - 6 * 60 * 60 * 1000;
  const at11am = sendAt + 5 * 60 * 60 * 1000;
  assert.ok(at11am >= sendAt);
  assert.ok(at11am < startMs - 30 * 60 * 1000);
});

test('confirmación SMS: diagnostica no enviado si no es Houston', () => {
  const info = explainConfirmationState({
    appointment: { patient: 'Ruth Kally', time: '12:00 PM', full_date: '2026-07-13', phone: '5551234567' },
    clinicName: 'Oxygengdl',
  });
  assert.equal(info.applicable, false);
});

test('confirmación SMS: primera sesión sin envío explica motivo', () => {
  const startMs = appointmentStartMs('2026-07-13', '12:00 PM', 'America/Chicago');
  const info = explainConfirmationState({
    appointment: {
      id: 'a1',
      patient: 'Ruth Kally',
      time: '12:00 PM',
      full_date: '2026-07-13',
      phone: '+12815551234',
      check_in_status: 'Agendado',
      is_new_patient: true,
      confirmation_status: CONFIRMATION_STATUS.NONE,
    },
    allAppointments: [],
    companyConfig: { confirmation_sms_enabled: true, confirmation_hours_before: 6 },
    clinicName: CLINIC_SHENANDOAH,
    now: startMs - 5 * 60 * 60 * 1000,
  });
  assert.equal(info.applicable, true);
  assert.equal(info.sent, false);
  assert.ok(/Twilio|Debería enviarse|próxima revisión/i.test(info.summaryEs));
});

test('promotor: correo no-show en inglés (Houston)', () => {
  const { subject, emailHtml } = buildPromoterNoShowEmail({
    patientName: 'Ruth Kelly',
    date: '2026-07-13',
    time: '12:00 PM',
    equipment: 'CHAMBER 1 60 MIN FLAT BED',
    clinicName: CLINIC_SHENANDOAH,
    clinicDisplayName: 'REGENOXY LLC',
    promoterName: 'Marco',
    promoterCode: 'MARKTR',
    locale: 'en',
  });
  assert.match(subject, /No-show: Ruth Kelly/i);
  assert.match(emailHtml, /marked as a <strong>no-show<\/strong>/i);
  assert.match(emailHtml, /MARKTR/);
});

test('no-show: revertir baja adeudo o regresa sesión a cartera', () => {
  const fromDebt = reverseNoShowWalletImpact({}, 2, { equipment: 'Chamber 1', servicePrice: 115 });
  assert.equal(fromDebt.restored, 'adeudo');
  assert.equal(fromDebt.adeudo, 1);

  const fromWallet = reverseNoShowWalletImpact({ price_115: 0 }, 0, { equipment: 'Chamber 1', servicePrice: 115 });
  assert.equal(fromWallet.restored, 'wallet');
  assert.ok(Object.values(fromWallet.wallets).some((n) => Number(n) > 0));

  const adjusted = adjustWalletSessions({ price_115: 2 }, { servicePrice: 115, delta: -1 });
  assert.equal(adjusted.price_115, 1);
});

test('login: IP conocida no pide NIP en dispositivo recordado', () => {
  const ip = '203.0.113.10';
  const device = { email: 'staff@clinic.com', pinVerifiedAt: Date.now() - 48 * 3600 * 1000, ipHash: hashClientIp(ip) };
  assert.equal(canAutoLoginWithoutPin(device, ip), true);
  assert.equal(canAutoLoginWithoutPin(device, '198.51.100.1'), false);
  assert.equal(normalizeClientIp('::ffff:203.0.113.10'), '203.0.113.10');
});

test('SMS staff: plantilla waiting incluye STOP y bloquea spam', () => {
  const ok = buildPatientSmsMessage({
    preset: 'waiting',
    locale: 'en',
    patientName: 'Ruth Kelly',
    clinicDisplayName: 'REGENOXY',
    date: '2026-07-16',
    time: '12:00 PM',
    clinicPhone: '7135913379',
  });
  assert.equal(ok.ok, true);
  assert.match(ok.body, /STOP/i);
  assert.match(ok.body, /REGENOXY/);

  const blocked = buildPatientSmsMessage({
    preset: 'custom',
    locale: 'en',
    patientName: 'Ruth',
    clinicDisplayName: 'REGENOXY',
    clinicPhone: '7135913379',
    customNote: 'buy crypto now bit.ly/x',
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'custom_note_blocked');
});

test('mensajes: canales Correo/SMS por tipo de aviso', () => {
  const bookingEmailOnly = resolveNotifyChannels({
    notify_use_email_booking: true,
    notify_use_sms_booking: false,
  }, 'booking');
  assert.equal(bookingEmailOnly.sendEmail, true);
  assert.equal(bookingEmailOnly.sendSms, false);

  const reminderSmsOnly = resolveNotifyChannels({
    notify_use_email_reminder: false,
    notify_use_sms_reminder: true,
  }, 'reminder');
  assert.equal(reminderSmsOnly.sendEmail, false);
  assert.equal(reminderSmsOnly.sendSms, true);

  const clinicSmsOff = resolveNotifyChannels({
    notify_channel_sms: false,
    notify_use_sms_booking: true,
  }, 'booking');
  assert.equal(clinicSmsOff.sendSms, false);
});

test('mensajes: correo siempre en reserva/cambio; SMS programación solo si se habilita', () => {
  const clinic = {
    notify_channel_email: true,
    notify_channel_sms: true,
    notify_use_sms_booking: true,
    notify_use_sms_reminder: false,
  };
  const bookingNoSms = resolveNotifyChannelsForPatient(clinic, 'booking', {
    prefers_email: false,
    prefers_sms: false,
    prefers_sms_reminder: true,
  });
  assert.equal(bookingNoSms.sendEmail, true);
  assert.equal(bookingNoSms.sendSms, false);

  const bookingSmsOn = resolveNotifyChannelsForPatient(clinic, 'booking', {
    prefers_email: false,
    prefers_sms: true,
  });
  assert.equal(bookingSmsOn.sendEmail, true);
  assert.equal(bookingSmsOn.sendSms, true);

  const reminderClinicSmsOff = resolveNotifyChannelsForPatient(clinic, 'reminder', {
    prefers_email: false,
    prefers_sms: true,
    prefers_sms_reminder: true,
  });
  assert.equal(reminderClinicSmsOff.sendEmail, true);
  assert.equal(reminderClinicSmsOff.sendSms, false);
});

test('expediente: mismo teléfono con nombre distinto se detecta', () => {
  const patients = [
    { id: 1, patient: 'CLAUDIA MAYRA VARGAS MARTÍNEZ', phone: '7135551212' },
  ];
  const linked = resolvePatientForAppointment(
    { patient: 'Claudia Vargas', phone: '7135551212' },
    patients,
  );
  assert.equal(linked?.id, 1);
  assert.equal(linked?.patient, 'CLAUDIA MAYRA VARGAS MARTÍNEZ');
});

test('expediente: mensajes de teléfono duplicado existen', () => {
  const orig = globalThis.window;
  let calls = 0;
  globalThis.window = {
    confirm: () => {
      calls += 1;
      return calls === 1; // use_existing
    },
  };
  try {
    assert.equal(chooseDuplicatePhoneAction({
      existingName: 'CLAUDIA MAYRA VARGAS MARTÍNEZ',
      typedName: 'Claudia Vargas',
      locale: 'es',
    }), 'use_existing');
    calls = 0;
    globalThis.window = { confirm: () => { calls += 1; return calls === 2; } };
    assert.equal(chooseDuplicatePhoneAction({
      existingName: 'CLAUDIA MAYRA VARGAS MARTÍNEZ',
      typedName: 'Claudia Vargas',
      locale: 'es',
    }), 'create_new');
  } finally {
    globalThis.window = orig;
  }
});

test('mensajes: primera cita siempre correo + SMS', () => {
  const channels = resolveNotifyChannelsForPatient({
    notify_channel_email: true,
    notify_channel_sms: true,
    notify_use_email_first: false,
    notify_use_sms_first: false,
  }, 'first', { prefers_email: false, prefers_sms: false });
  assert.equal(channels.sendEmail, true);
  assert.equal(channels.sendSms, true);
});

test('recordatorio: ventana diaria según horas antes', () => {
  const now = new Date('2026-07-16T15:00:00');
  const inWindow = {
    full_date: '2026-07-17',
    time: '15:00',
  };
  assert.equal(isAppointmentInReminderWindow(inWindow, 24, now), true);
  assert.equal(isAppointmentInReminderWindow({ full_date: '2026-07-20', time: '15:00' }, 24, now), false);
});

test('reporte semanal GDL: semana anterior lun-dom', () => {
  const monday = new Date('2026-08-17T12:00:00-06:00');
  const range = getPreviousWeekRange('America/Mexico_City', monday);
  assert.equal(range.startDate, '2026-08-10');
  assert.equal(range.endDate, '2026-08-16');
});

test('reporte semanal GDL: subtotales por método de pago', () => {
  const summary = summarizeSalesRows([
    { price: 1000, paymentMethod: 'Efectivo' },
    { price: 500, paymentMethod: 'Transferencia' },
    { price: 800, paymentMethod: 'Tarjeta de Crédito' },
    { price: 300, paymentMethod: 'Tarjeta de Débito' },
  ]);
  assert.equal(summary.total, 2600);
  assert.equal(summary.txCount, 4);
  assert.equal(summary.byMethod[PAYMENT_METHOD_KEYS.CASH], 1000);
  assert.equal(summary.byMethod[PAYMENT_METHOD_KEYS.TRANSFER], 500);
  assert.equal(summary.byMethod[PAYMENT_METHOD_KEYS.CREDIT], 800);
  assert.equal(summary.byMethod[PAYMENT_METHOD_KEYS.DEBIT], 300);
});

test('cron diario: reporte PDF solo los lunes CDMX', () => {
  const monday = new Date('2026-08-17T12:00:00-06:00');
  const tuesday = new Date('2026-08-18T12:00:00-06:00');
  assert.equal(isMondayInTimezone('America/Mexico_City', monday), true);
  assert.equal(isMondayInTimezone('America/Mexico_City', tuesday), false);
});

console.log(`\n${passed} pruebas OK\n`);
if (process.exitCode) process.exit(process.exitCode);
