import assert from 'node:assert/strict';
import {
  publicBookingAuditLabels,
  publicCancelAuditLabels,
  publicRescheduleAuditLabels,
  insertAuditLog,
} from '../lib/auditLog.js';

const bookingEs = publicBookingAuditLabels('es');
assert.equal(bookingEs.action, 'RESERVA ONLINE');
assert.match(bookingEs.changedBy, /portal/i);

const cancelSms = publicCancelAuditLabels('en', 'sms_no');
assert.equal(cancelSms.action, 'SMS CANCEL (NO)');
assert.match(cancelSms.changedBy, /SMS/i);

const cancelOnline = publicCancelAuditLabels('es', 'manage');
assert.equal(cancelOnline.action, 'CANCELACIÓN ONLINE');

const reschedule = publicRescheduleAuditLabels('en');
assert.equal(reschedule.action, 'ONLINE RESCHEDULE');

const calls = [];
const fakeSupabase = {
  from(table) {
    assert.equal(table, 'audit_logs');
    return {
      insert(rows) {
        calls.push(rows);
        return Promise.resolve({ error: null });
      },
    };
  },
};

const result = await insertAuditLog(fakeSupabase, {
  appointmentId: 'a1',
  patientName: 'Jane Doe',
  action: 'RESERVA ONLINE',
  changedBy: 'Paciente (portal)',
  details: '2026-07-21 10:30',
});
assert.equal(result.ok, true);
assert.equal(calls[0][0].patient_name, 'Jane Doe');
assert.equal(calls[0][0].appointment_id, 'a1');

const skipped = await insertAuditLog(fakeSupabase, { patientName: '', action: 'X' });
assert.equal(skipped.skipped, true);

console.log('verify-audit-log: OK');
