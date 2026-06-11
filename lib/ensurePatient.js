/**
 * Motor compartido GDL + Shenandoah: un expediente por teléfono (por clínica).
 * GDL usa columnas legacy (Name, Phone, Email); otras instancias pueden usar minúsculas.
 */

export function normalizeStr(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

export function formatPhoneDisplay(lada, rawPhone) {
  const last10 = digitsOnly(rawPhone).slice(-10);
  const prefix = String(lada || '').trim() || '+52';
  return `${prefix} ${last10}`;
}

function isMissingColumnError(error) {
  return !!error?.message && /column|schema cache/i.test(error.message);
}

function getPatientName(row) {
  return String(row?.Name || row?.name || row?.Nombre || 'Sin Nombre').trim();
}

function getPatientPhone(row) {
  return String(row?.Phone || row?.phone || '').trim();
}

function getPatientEmail(row) {
  return String(row?.Email || row?.email || '').trim();
}

function phoneLast10(row) {
  return digitsOnly(getPatientPhone(row)).slice(-10);
}

const PATIENT_SCHEMAS = [
  { name: 'Name', phone: 'Phone', email: 'Email' },
  { name: 'name', phone: 'phone', email: 'email' },
];

function buildPatientRow(schema, payload) {
  return {
    [schema.name]: payload.name,
    [schema.phone]: payload.phone,
    [schema.email]: payload.email,
    protocol: payload.protocol,
    notes: payload.notes,
    prefers_email: payload.prefers_email,
    prefers_sms: payload.prefers_sms,
  };
}

async function findPatientByPhone(supabase, last10) {
  if (last10.length !== 10) return null;

  for (const col of ['Phone', 'phone']) {
    const res = await supabase.from('patients').select('*').ilike(col, `%${last10}`);
    if (res.error) {
      if (isMissingColumnError(res.error)) continue;
      throw res.error;
    }
    const match = (res.data || []).find((row) => phoneLast10(row) === last10);
    if (match) return match;
  }

  return null;
}

async function findPatientByEmail(supabase, email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;

  for (const col of ['Email', 'email']) {
    const res = await supabase.from('patients').select('*').ilike(col, normalized);
    if (res.error) {
      if (isMissingColumnError(res.error)) continue;
      throw res.error;
    }
    const match = (res.data || []).find((row) => getPatientEmail(row).toLowerCase() === normalized);
    if (match) return match;
  }

  return null;
}

async function insertPatient(supabase, payload) {
  for (const schema of PATIENT_SCHEMAS) {
    const res = await supabase.from('patients').insert([buildPatientRow(schema, payload)]).select('*');
    if (!res.error) return res.data?.[0] || null;
    if (!isMissingColumnError(res.error)) throw res.error;
  }
  return null;
}

async function updatePatient(supabase, id, patch) {
  for (const schema of PATIENT_SCHEMAS) {
    const res = await supabase.from('patients').update(buildPatientRow(schema, patch)).eq('id', id);
    if (!res.error) return;
    if (!isMissingColumnError(res.error)) throw res.error;
  }
}

/**
 * Busca por teléfono (prioridad) o email; crea o actualiza sin duplicar.
 */
export async function ensurePatient(supabase, {
  name,
  phone,
  email = '',
  protocol = 'Wellness',
  notes = '',
  prefers_email = true,
  prefers_sms = true,
}) {
  const trimmedName = String(name || '').trim();
  const trimmedPhone = String(phone || '').trim();
  const trimmedEmail = String(email || '').trim();
  const last10 = digitsOnly(trimmedPhone).slice(-10);

  if (!trimmedName) {
    return { error: new Error('Nombre requerido') };
  }
  if (last10.length !== 10) {
    return { error: new Error('Teléfono debe tener 10 dígitos') };
  }

  let existing = await findPatientByPhone(supabase, last10);
  if (!existing && trimmedEmail) {
    existing = await findPatientByEmail(supabase, trimmedEmail);
  }

  const basePatch = {
    name: trimmedName,
    phone: trimmedPhone,
    email: trimmedEmail,
    protocol: protocol || 'Wellness',
    notes: notes || '',
    prefers_email: prefers_email !== false,
    prefers_sms: prefers_sms !== false,
  };

  if (existing) {
    const mergedNotes = [getPatientName(existing) !== trimmedName ? `Alias web: ${trimmedName}` : '', basePatch.notes]
      .filter(Boolean)
      .join(' · ') || (existing.notes || existing.Notes || '');

    await updatePatient(supabase, existing.id, {
      ...basePatch,
      name: getPatientName(existing),
      notes: mergedNotes,
      email: trimmedEmail || getPatientEmail(existing),
    });

    return {
      id: existing.id,
      displayName: getPatientName(existing),
      phone: trimmedPhone,
      email: trimmedEmail || getPatientEmail(existing),
      isNew: false,
    };
  }

  const created = await insertPatient(supabase, basePatch);
  if (!created) {
    return { error: new Error('No se pudo crear el paciente') };
  }

  return {
    id: created.id,
    displayName: getPatientName(created),
    phone: getPatientPhone(created) || trimmedPhone,
    email: getPatientEmail(created) || trimmedEmail,
    isNew: true,
  };
}
