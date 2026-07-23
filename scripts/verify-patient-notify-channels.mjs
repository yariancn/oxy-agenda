import assert from 'node:assert/strict';
import {
  getAutoNotifyBlockReason,
  resolveNotifyChannels,
  resolveNotifyChannelsForPatient,
} from '../lib/notifySettings.js';

// Clinic with reminder SMS explicitly off
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

// Clinic SMS reminder off → patient cannot get reminder SMS
const patientWantsSms = resolveNotifyChannelsForPatient(configEmailOnlyReminder, 'reminder', {
  prefers_email: true,
  prefers_sms: true,
  prefers_sms_reminder: true,
});
assert.equal(patientWantsSms.sendEmail, true);
assert.equal(patientWantsSms.sendSms, false);

const clinicAllOn = {
  notify_channel_email: true,
  notify_channel_sms: true,
  notify_auto_reminder: true,
};

// Default patient: email on, SMS reminder on, SMS scheduling off
const defaultPatientReminder = resolveNotifyChannelsForPatient(clinicAllOn, 'reminder', {
  prefers_email: true,
  prefers_sms: false,
});
assert.equal(defaultPatientReminder.sendEmail, true);
assert.equal(defaultPatientReminder.sendSms, true);

const defaultPatientBooking = resolveNotifyChannelsForPatient(clinicAllOn, 'booking', {
  prefers_email: true,
  prefers_sms: false,
});
assert.equal(defaultPatientBooking.sendEmail, true);
assert.equal(defaultPatientBooking.sendSms, false);

// Undefined SMS scheduling = opt-out; undefined reminder SMS = on
const undefinedSms = resolveNotifyChannelsForPatient(clinicAllOn, 'booking', {
  prefers_email: true,
  prefers_sms: undefined,
});
assert.equal(undefinedSms.sendEmail, true);
assert.equal(undefinedSms.sendSms, false);

const undefinedReminder = resolveNotifyChannelsForPatient(clinicAllOn, 'reminder', {
  prefers_email: true,
  prefers_sms_reminder: undefined,
});
assert.equal(undefinedReminder.sendEmail, true);
assert.equal(undefinedReminder.sendSms, true);

// Patient SMS scheduling opt-in
const schedulingSms = resolveNotifyChannelsForPatient(clinicAllOn, 'booking', {
  prefers_email: true,
  prefers_sms: true,
});
assert.equal(schedulingSms.sendSms, true);

const rescheduleSms = resolveNotifyChannelsForPatient(clinicAllOn, 'reschedule', {
  prefers_email: true,
  prefers_sms: true,
});
assert.equal(rescheduleSms.sendSms, true);

// Patient opted out of reminder SMS
const reminderOptOut = resolveNotifyChannelsForPatient(clinicAllOn, 'reminder', {
  prefers_email: true,
  prefers_sms_reminder: false,
});
assert.equal(reminderOptOut.sendEmail, true);
assert.equal(reminderOptOut.sendSms, false);

// Email-only patient for reminders
const emailOnlyReminder = resolveNotifyChannelsForPatient(clinicAllOn, 'reminder', {
  prefers_email: true,
  prefers_sms_reminder: false,
  prefers_sms: false,
});
assert.equal(emailOnlyReminder.sendEmail, true);
assert.equal(emailOnlyReminder.sendSms, false);

// Patient opted out of both email and reminder SMS
const optedOut = resolveNotifyChannelsForPatient(clinicAllOn, 'reminder', {
  prefers_email: false,
  prefers_sms_reminder: false,
});
assert.equal(optedOut.sendEmail, false);
assert.equal(optedOut.sendSms, false);

// Clinic-wide SMS kill switch still blocks
const clinicSmsOff = resolveNotifyChannelsForPatient({
  ...clinicAllOn,
  notify_channel_sms: false,
}, 'reminder', { prefers_email: true, prefers_sms_reminder: true });
assert.equal(clinicSmsOff.sendEmail, true);
assert.equal(clinicSmsOff.sendSms, false);

assert.equal(getAutoNotifyBlockReason(clinicAllOn, 'reminder', 'es'), null);
assert.equal(getAutoNotifyBlockReason({ notify_auto_reminder: false }, 'reminder', 'es') != null, true);

// First visit always email + SMS (ignores patient opt-out and per-event toggles)
const firstForced = resolveNotifyChannelsForPatient({
  notify_channel_email: true,
  notify_channel_sms: true,
  notify_use_email_first: false,
  notify_use_sms_first: false,
}, 'first', { prefers_email: false, prefers_sms: false, prefers_sms_reminder: false });
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

// Clinic defaults: SMS on for all events unless explicitly false
const bookingClinic = resolveNotifyChannels({
  notify_channel_email: true,
  notify_channel_sms: true,
}, 'booking');
assert.equal(bookingClinic.sendEmail, true);
assert.equal(bookingClinic.sendSms, true);

console.log('verify-patient-notify-channels: OK');
