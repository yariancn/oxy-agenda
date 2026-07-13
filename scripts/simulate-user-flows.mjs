#!/usr/bin/env node
/**
 * Simulaciones rápidas de lógica crítica (sin BD).
 * node scripts/simulate-user-flows.mjs
 */

import assert from 'node:assert/strict';
import { resolvePatientForAppointment } from '../lib/ensurePatient.js';
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
});

console.log(`\n${passed} pruebas OK\n`);
if (process.exitCode) process.exit(process.exitCode);
