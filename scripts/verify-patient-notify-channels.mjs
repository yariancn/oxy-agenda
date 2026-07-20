import assert from 'node:assert/strict';
import {
  getAutoNotifyBlockReason,
  resolveNotifyChannels,
  resolveNotifyChannelsForPatient,
} from '../lib/notifySettings.js';

// Admin: reminder email-only
const configEmailOnlyReminder = {
  notify_channel_email: true,
  notify_channel_sms: true,
  notify_use_email_reminder: true,
  notify_use_sms_reminder: false,
  notify_auto_reminder: true,
};

const clinic = resolveNotifyChannels(configEmailOnlyReminder, 'reminder');
assert.equal(clinic.sendEmail, true);
assert.equal(clinic.sendSms, false);

// Patient wants SMS → SMS wins over Admin email-only
const patientWantsSms = resolveNotifyChannelsForPatient(configEmailOnlyReminder, 'reminder', {
  prefers_email: true,
  prefers_sms: true,
});
assert.equal(patientWantsSms.sendEmail, true);
assert.equal(patientWantsSms.sendSms, true);

// Patient SMS only
const smsOnlyPatient = resolveNotifyChannelsForPatient(configEmailOnlyReminder, 'reminder', {
  prefers_email: false,
  prefers_sms: true,
});
assert.equal(smsOnlyPatient.sendEmail, false);
assert.equal(smsOnlyPatient.sendSms, true);

// Patient opted out of both
const optedOut = resolveNotifyChannelsForPatient(configEmailOnlyReminder, 'reminder', {
  prefers_email: false,
  prefers_sms: false,
});
assert.equal(optedOut.sendEmail, false);
assert.equal(optedOut.sendSms, false);

// Clinic-wide SMS kill switch still blocks
const clinicSmsOff = resolveNotifyChannelsForPatient({
  ...configEmailOnlyReminder,
  notify_channel_sms: false,
}, 'reminder', { prefers_email: true, prefers_sms: true });
assert.equal(clinicSmsOff.sendEmail, true);
assert.equal(clinicSmsOff.sendSms, false);

// Auto notify no longer blocked just because per-event SMS is off
assert.equal(getAutoNotifyBlockReason(configEmailOnlyReminder, 'reminder', 'es'), null);

// First visit always email + SMS (ignores patient opt-out and per-event toggles)
const firstForced = resolveNotifyChannelsForPatient({
  notify_channel_email: true,
  notify_channel_sms: true,
  notify_use_email_first: false,
  notify_use_sms_first: false,
}, 'first', { prefers_email: false, prefers_sms: false });
assert.equal(firstForced.sendEmail, true);
assert.equal(firstForced.sendSms, true);

const firstClinic = resolveNotifyChannels({
  notify_channel_email: true,
  notify_channel_sms: true,
  notify_use_email_first: false,
  notify_use_sms_first: false,
}, 'first');
assert.equal(firstClinic.sendEmail, true);
assert.equal(firstClinic.sendSms, true);

console.log('verify-patient-notify-channels: OK');
