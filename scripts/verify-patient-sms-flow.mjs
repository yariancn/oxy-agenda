/**
 * Full staff patient-SMS flow verification with mocked Supabase + SMS transport.
 * Run: node scripts/verify-patient-sms-flow.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPatientSmsMessage } from '../lib/patientStaffSms.js';
import { runStaffPatientSms } from '../lib/staffPatientSmsFlow.js';
import { selectWithColumnFallback } from '../lib/supabaseSelectSafe.js';

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

// --- Source guards ---
const routeSrc = readFileSync(new URL('../app/api/staff/patient-sms/route.js', import.meta.url), 'utf8');
const flowSrc = readFileSync(new URL('../lib/staffPatientSmsFlow.js', import.meta.url), 'utf8');
if (/\.insert\([\s\S]*?\)\.catch\(/.test(routeSrc) || /\.insert\([\s\S]*?\)\.catch\(/.test(flowSrc)) {
  fail('still chains .catch() on insert()');
}
assert.match(flowSrc, /const \{ error: auditError \} = await supabase\.from\('audit_logs'\)\.insert/);

// --- Message build ---
const built = buildPatientSmsMessage({
  preset: 'custom',
  locale: 'es',
  patientName: 'María López',
  clinicDisplayName: 'Oxygengdl',
  clinicPhone: '33 1234 5678',
  customNote: 'Hola, te escribimos de Oxygengdl, si deseas tu siguiente cita, sera necesario liquides ante programar.',
});
assert.equal(built.ok, true);
assert.match(built.body, /Oxygengdl/);
assert.match(built.body, /STOP/i);

assert.equal(buildPatientSmsMessage({
  preset: 'custom', locale: 'es', clinicDisplayName: 'Oxygengdl', customNote: 'promo bit.ly/x',
}).ok, false);

assert.equal(buildPatientSmsMessage({
  preset: 'custom', locale: 'es', clinicDisplayName: 'Oxygengdl', customNote: '   ',
}).error, 'custom_note_required');

// --- Supabase builder has .then but no .catch (production crash repro) ---
function createThenableBuilder(result) {
  return {
    then(onFulfilled, onRejected) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
}
const fakeBuilder = createThenableBuilder({ data: null, error: null });
assert.equal(typeof fakeBuilder.catch, 'undefined');
assert.equal((await fakeBuilder).error, null);
let catchThrew = false;
try {
  fakeBuilder.catch(() => null);
} catch {
  catchThrew = true;
}
assert.equal(catchThrew, true);

// --- Column fallback ---
const { data: appRow, error: selErr, columns } = await selectWithColumnFallback(
  async (cols) => {
    const list = cols.split(',').map((c) => c.trim());
    for (const bad of ['email', 'prefers_sms', 'prefers_email']) {
      if (list.includes(bad)) {
        return { data: null, error: { message: `column appointments.${bad} does not exist` } };
      }
    }
    return {
      data: {
        id: 'appt-1',
        patient: 'María López',
        phone: '3312345678',
        time: '10:00',
        full_date: '2026-07-17',
        equipment: 'Cámara 1',
        patient_id: 'pat-1',
      },
      error: null,
    };
  },
  ['id', 'patient', 'phone', 'time', 'full_date', 'equipment', 'patient_id', 'email', 'prefers_sms'],
);
assert.equal(selErr, null);
assert.equal(appRow.id, 'appt-1');
assert.ok(!columns.includes('email'));

// --- Mock Supabase client for full runStaffPatientSms ---
function createMockSupabase({ appointment, patient, config, auditError = null }) {
  return {
    from(table) {
      if (table === 'appointments') {
        const api = {
          select() { return api; },
          eq() { return api; },
          maybeSingle: async () => ({ data: appointment, error: null }),
        };
        return api;
      }
      if (table === 'patients') {
        const api = {
          select() { return api; },
          eq() { return api; },
          ilike() { return api; },
          limit() { return api; },
          maybeSingle: async () => ({ data: patient, error: null }),
          then(onFulfilled, onRejected) {
            return Promise.resolve({ data: patient ? [patient] : [], error: null }).then(onFulfilled, onRejected);
          },
        };
        return api;
      }
      if (table === 'company_config') {
        const api = {
          select() { return api; },
          eq() { return api; },
          maybeSingle: async () => ({ data: config, error: null }),
        };
        return api;
      }
      if (table === 'audit_logs') {
        // Intentionally thenable WITHOUT .catch — matches real PostgREST builder.
        return {
          insert() {
            return createThenableBuilder({ data: null, error: auditError });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const mockPatient = {
  id: 'pat-1',
  Name: 'María López',
  Phone: '3312345678',
  prefers_sms: true,
};

const mockAppt = {
  id: 'appt-1',
  patient: 'María López',
  phone: '3312345678',
  time: '10:00',
  full_date: '2026-07-17',
  equipment: 'Cámara 1',
  patient_id: 'pat-1',
};

const mockConfig = { name: 'Oxygengdl', phone: '3311111111' };

// Success path: SMS ok + audit thenable without .catch
{
  const result = await runStaffPatientSms({
    supabase: createMockSupabase({ appointment: mockAppt, patient: mockPatient, config: mockConfig }),
    user: { name: 'Staff', email: 'staff@oxy.com' },
    clinicName: 'Oxygengdl',
    appointmentId: 'appt-1',
    preset: 'custom',
    customNote: 'Si deseas tu siguiente cita, liquida antes de programar.',
    locale: 'es',
    sendSms: async () => ({
      ok: true,
      body: built.body,
      preset: 'custom',
      channel: 'sms',
    }),
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.preset, 'custom');
  assert.ok(result.body.body.includes('STOP') || result.body.body.length > 5);
}

// Audit failure must NOT fail the response after SMS sent
{
  const result = await runStaffPatientSms({
    supabase: createMockSupabase({
      appointment: mockAppt,
      patient: mockPatient,
      config: mockConfig,
      auditError: { message: 'audit unavailable' },
    }),
    user: { name: 'Staff' },
    clinicName: 'Oxygengdl',
    appointmentId: 'appt-1',
    preset: 'custom',
    customNote: 'Nota corta de prueba',
    locale: 'es',
    sendSms: async () => ({ ok: true, body: 'ok', preset: 'custom', channel: 'sms' }),
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
}

// prefers_sms off on patient blocks send
{
  const result = await runStaffPatientSms({
    supabase: createMockSupabase({
      appointment: mockAppt,
      patient: { ...mockPatient, prefers_sms: false },
      config: mockConfig,
    }),
    user: { name: 'Staff' },
    clinicName: 'Oxygengdl',
    appointmentId: 'appt-1',
    preset: 'custom',
    customNote: 'Nota',
    locale: 'es',
    sendSms: async () => {
      throw new Error('should not send');
    },
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'prefers_sms_off');
}

// Appointment not found
{
  const result = await runStaffPatientSms({
    supabase: createMockSupabase({ appointment: null, patient: null, config: mockConfig }),
    user: { name: 'Staff' },
    clinicName: 'Oxygengdl',
    appointmentId: 'missing',
    preset: 'reminder',
    locale: 'es',
    sendSms: async () => ({ ok: true, body: 'x', preset: 'reminder', channel: 'sms' }),
  });
  assert.equal(result.status, 404);
  assert.equal(result.body.error, 'not_found');
}

console.log('verify-patient-sms-flow: OK');
console.log('- no .catch on supabase insert');
console.log('- custom SMS builds');
console.log('- full success path with thenable audit insert');
console.log('- audit errors do not fail after SMS sent');
console.log('- prefers_sms from patients enforced');
