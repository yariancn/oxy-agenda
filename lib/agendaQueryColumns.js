/**
 * Lean column lists for agenda loads.
 * Never include appointment `signature` (base64 PNGs) in list/sync payloads —
 * that alone can dominate cellular usage and cold-start time on tablets.
 * Fetch signatures only when printing / opening a single sealed visit.
 */

export const APPOINTMENT_LIST_COLUMNS = [
  'id',
  'time',
  'full_date',
  'equipment',
  'check_in_status',
  'outside_normal_hours',
  'is_extended_block',
  'patient',
  'duration',
  'buffer',
  'day',
  'clinic',
  'is_new_patient',
  'confirmation_status',
  'confirmation_sent_at',
  'confirmation_replied_at',
  'confirmation_reply',
  'phone',
  'notes',
  'attendant',
  'patient_id',
  'prefers_email',
  'prefers_sms',
  'promoter_code',
].join(', ');

/** Minimal set if some optional columns are missing in a clinic schema. */
export const APPOINTMENT_LIST_COLUMNS_MIN = [
  'id',
  'time',
  'full_date',
  'equipment',
  'check_in_status',
  'patient',
  'duration',
  'buffer',
  'day',
  'clinic',
  'notes',
  'attendant',
  'phone',
  'patient_id',
  'is_new_patient',
  'confirmation_status',
  'confirmation_sent_at',
].join(', ');

export const PATIENT_LIST_COLUMNS = [
  'id',
  'Name',
  'name',
  'Nombre',
  'Phone',
  'phone',
  'Email',
  'email',
  'protocol',
  'notes',
  'Notes',
  'is_blocked',
  'block_reason',
  'prefers_email',
  'prefers_sms',
  'prefers_sms_reminder',
  'wallets',
  'package_history',
  'historico_sesiones',
  'adeudo',
  'session_group_id',
].join(', ');

export function stripAppointmentSignatures(rows = []) {
  return (rows || []).map((row) => {
    if (!row || row.signature == null) return row;
    const { signature, ...rest } = row;
    return rest;
  });
}
