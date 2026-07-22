import { digitsOnly, ensurePatient, normalizeStr } from './ensurePatient.js';

function appointmentPatientName(row) {
  return String(row?.patient || row?.Name || row?.name || '').trim();
}

function appointmentPhone(row) {
  return String(row?.phone || row?.Phone || '').trim();
}

/**
 * Create missing patient charts from appointments that have a name (+ preferably phone)
 * but no matching patients row. Links patient_id when the column exists.
 */
export async function repairOrphanAppointmentPatients(supabase, {
  lookbackDays = 45,
  todayIso = null,
} = {}) {
  const today = todayIso || new Date().toISOString().slice(0, 10);
  const start = new Date(`${today}T12:00:00`);
  start.setDate(start.getDate() - Math.max(0, Number(lookbackDays) || 45));
  const fromIso = start.toISOString().slice(0, 10);

  const { data: appointments, error: aErr } = await supabase
    .from('appointments')
    .select('*')
    .gte('full_date', fromIso)
    .order('full_date', { ascending: false })
    .limit(5000);
  if (aErr) throw new Error(`appointments: ${aErr.message}`);

  const { data: patients, error: pErr } = await supabase
    .from('patients')
    .select('*');
  if (pErr) throw new Error(`patients: ${pErr.message}`);

  const byName = new Map();
  const byPhone = new Map();
  for (const p of patients || []) {
    const name = normalizeStr(p.Name || p.name || p.Nombre || '');
    const phone = digitsOnly(p.Phone || p.phone).slice(-10);
    if (name) byName.set(name, p);
    if (phone.length === 10) byPhone.set(phone, p);
  }

  const created = [];
  const linked = [];
  const skipped = [];
  const seenKeys = new Set();

  for (const app of appointments || []) {
    const name = appointmentPatientName(app);
    if (!name || normalizeStr(name) === 'sin nombre') {
      skipped.push({ id: app.id, reason: 'no_name' });
      continue;
    }
    const phone = appointmentPhone(app);
    const last10 = digitsOnly(phone).slice(-10);
    const nameKey = normalizeStr(name);
    const existing = (last10.length === 10 && byPhone.get(last10))
      || byName.get(nameKey)
      || null;

    if (existing) {
      if (!app.patient_id || String(app.patient_id) !== String(existing.id)) {
        const { error } = await supabase
          .from('appointments')
          .update({ patient_id: existing.id })
          .eq('id', app.id);
        if (!error) linked.push({ appointmentId: app.id, patientId: existing.id, name });
      }
      continue;
    }

    if (last10.length !== 10) {
      skipped.push({ id: app.id, reason: 'no_phone', name });
      continue;
    }

    const dedupeKey = `${last10}|${nameKey}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    const email = String(app.email || app.Email || '').trim();
    const ensured = await ensurePatient(supabase, {
      name,
      phone,
      email,
      prefers_email: true,
      prefers_sms: false,
      namePolicy: 'prefer_incoming',
      forceCreate: false,
    });
    if (ensured.error) {
      skipped.push({ id: app.id, reason: ensured.error.message, name });
      continue;
    }

    const patientId = ensured.id;
    byName.set(nameKey, { id: patientId, Name: ensured.displayName });
    byPhone.set(last10, { id: patientId });
    created.push({ appointmentId: app.id, patientId, name: ensured.displayName, phone: last10 });

    const { error: linkErr } = await supabase
      .from('appointments')
      .update({ patient_id: patientId })
      .eq('id', app.id);
    if (!linkErr) linked.push({ appointmentId: app.id, patientId, name: ensured.displayName });
  }

  return {
    scanned: (appointments || []).length,
    patientsBefore: (patients || []).length,
    created: created.length,
    linked: linked.length,
    skipped: skipped.length,
    createdSample: created.slice(0, 20),
    skippedSample: skipped.filter((s) => s.reason !== 'no_name').slice(0, 20),
  };
}
