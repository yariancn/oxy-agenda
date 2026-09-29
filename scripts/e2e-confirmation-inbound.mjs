/**
 * End-to-end: create a throwaway pending confirmation, simulate LabsMobile SI inbound,
 * verify DB, then clean up.
 *
 *   node --env-file=.env.local scripts/e2e-confirmation-inbound.mjs
 */
import {
  CONFIRMATION_STATUS,
  parseConfirmationReply,
} from '../lib/appointmentConfirmation.js';
import { processConfirmationInboundReply } from '../lib/processConfirmationInbound.js';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { CLINIC_OXYGENDGL } from '../lib/clinicRegistry.js';

const TEST_PHONE = '523399988877';
const TEST_PATIENT = 'TEST CONFIRMACION SMS (borrar)';

function tomorrowIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log('parse SI/SÍ/NO:', parseConfirmationReply('SÍ'), parseConfirmationReply('NO'));

  const supabase = getSupabaseAdmin(CLINIC_OXYGENDGL);
  const fullDate = tomorrowIso();

  // Clean leftovers from prior runs
  await supabase.from('appointments').delete().eq('patient', TEST_PATIENT).eq('phone', TEST_PHONE);

  const insertPayload = {
    patient: TEST_PATIENT,
    phone: TEST_PHONE,
    full_date: fullDate,
    time: '10:00 AM',
    equipment: 'Camara 1',
    protocol: 'TEST',
    check_in_status: 'Agendado',
    confirmation_status: CONFIRMATION_STATUS.PENDING,
    confirmation_sent_at: new Date().toISOString(),
    confirmation_replied_at: null,
    confirmation_reply: null,
    is_new_patient: true,
    notes: 'E2E confirmation inbound test — safe to delete',
  };

  const { data: created, error: insertErr } = await supabase
    .from('appointments')
    .insert(insertPayload)
    .select('id, patient, phone, confirmation_status')
    .single();

  if (insertErr) {
    // Column missing? try without confirmation fields
    console.error('Insert failed:', insertErr.message);
    process.exit(1);
  }

  console.log('Created pending appt', created.id);

  const result = await processConfirmationInboundReply({
    clinicName: CLINIC_OXYGENDGL,
    fromPhone: TEST_PHONE,
    bodyText: 'SI',
  });

  console.log('Inbound result:', JSON.stringify(result, null, 2));

  const { data: after } = await supabase
    .from('appointments')
    .select('id, confirmation_status, confirmation_reply, confirmation_replied_at, check_in_status')
    .eq('id', created.id)
    .single();

  console.log('DB after SI:', after);

  const ok = result.ok
    && result.reply === 'confirmed'
    && after?.confirmation_status === CONFIRMATION_STATUS.CONFIRMED;

  // Reset to pending and test NO
  await supabase.from('appointments').update({
    confirmation_status: CONFIRMATION_STATUS.PENDING,
    confirmation_replied_at: null,
    confirmation_reply: null,
    check_in_status: 'Agendado',
  }).eq('id', created.id);

  const resultNo = await processConfirmationInboundReply({
    clinicName: CLINIC_OXYGENDGL,
    fromPhone: TEST_PHONE,
    bodyText: 'NO',
  });

  const { data: afterNo } = await supabase
    .from('appointments')
    .select('id, confirmation_status, confirmation_reply, check_in_status')
    .eq('id', created.id)
    .single();

  console.log('Inbound NO result:', { ok: resultNo.ok, reply: resultNo.reply, status: resultNo.nextStatus });
  console.log('DB after NO:', afterNo);

  const okNo = resultNo.ok
    && resultNo.reply === 'declined'
    && afterNo?.confirmation_status === CONFIRMATION_STATUS.DECLINED;

  // Cleanup
  await supabase.from('appointments').delete().eq('id', created.id);
  console.log('Cleaned up test appointment');

  if (ok && okNo) {
    console.log('\nE2E PASS: SI and NO both update the appointment in Supabase GDL.');
    process.exit(0);
  }
  console.error('\nE2E FAIL');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
