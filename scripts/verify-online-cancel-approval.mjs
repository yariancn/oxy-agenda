import assert from 'node:assert/strict';
import { appointmentStartMs } from '../lib/appointmentConfirmation.js';
import {
  CANCEL_REQUEST_STATUS,
  evaluatePatientSelfManage,
  isCancelRequestPending,
} from '../lib/appointmentManage.js';
import { buildStaffCancelRequestAlertContent } from '../lib/staffBookingAlert.js';

// Host-TZ independence: 10:30 America/Chicago in July = 15:30Z (CDT)
const chicago1030 = appointmentStartMs('2026-07-20', '10:30', 'America/Chicago');
assert.equal(new Date(chicago1030).toISOString(), '2026-07-20T15:30:00.000Z');

const chicago1030Am = appointmentStartMs('2026-07-20', '10:30 AM', 'America/Chicago');
assert.equal(new Date(chicago1030Am).toISOString(), '2026-07-20T15:30:00.000Z');

// Same-morning Houston cancel must be blocked with 24h rule
const morningAppt = {
  id: 'a1',
  full_date: '2026-07-20',
  time: '10:30',
  check_in_status: 'Agendado',
};
const at800amChicago = Date.parse('2026-07-20T13:00:00.000Z'); // 8:00 CDT
const realNow = Date.now;
Date.now = () => at800amChicago;
try {
  const tooSoon = evaluatePatientSelfManage({
    appointment: morningAppt,
    clinicName: 'Shenandoah',
    cancelLimitHours: 24,
  });
  assert.equal(tooSoon.ok, false);
  assert.equal(tooSoon.reason, 'too_soon');
} finally {
  Date.now = realNow;
}

// Far enough out → allowed
const nextWeek = {
  id: 'a2',
  full_date: '2026-07-27',
  time: '10:30',
  check_in_status: 'Agendado',
};
Date.now = () => at800amChicago;
try {
  const ok = evaluatePatientSelfManage({
    appointment: nextWeek,
    clinicName: 'Shenandoah',
    cancelLimitHours: 24,
  });
  assert.equal(ok.ok, true);
} finally {
  Date.now = realNow;
}

// Pending cancel blocks further online manage
const pending = evaluatePatientSelfManage({
  appointment: { ...nextWeek, check_in_status: CANCEL_REQUEST_STATUS },
  clinicName: 'Shenandoah',
  cancelLimitHours: 24,
});
assert.equal(pending.ok, false);
assert.equal(pending.reason, 'closed');
assert.equal(isCancelRequestPending(CANCEL_REQUEST_STATUS), true);

const alert = buildStaffCancelRequestAlertContent({
  locale: 'en',
  patientName: 'Jane Doe',
  date: '2026-07-27',
  time: '10:30',
  equipment: 'Chamber 1',
  clinicName: 'Shenandoah',
  clinicDisplayName: 'Oxygen Houston',
  source: 'manage',
});
assert.match(alert.subject, /pending/i);
assert.match(alert.smsBody, /pending approval/i);

const smsNoAlert = buildStaffCancelRequestAlertContent({
  locale: 'en',
  patientName: 'Jane Doe',
  date: '2026-07-27',
  time: '10:30',
  equipment: 'Chamber 1',
  clinicName: 'Shenandoah',
  clinicDisplayName: 'Oxygen Houston',
  source: 'sms_no',
});
assert.match(smsNoAlert.subject, /SMS NO/i);
assert.match(smsNoAlert.smsBody, /replied NO by SMS/i);

console.log('verify-online-cancel-approval: OK');
