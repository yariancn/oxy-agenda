/**
 * Motor compartido GDL + Shenandoah: un expediente por teléfono (por clínica).
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

async function findPatientByPhone(supabase, last10) {
  if (last10.length !== 10) return null;

  let res = await supabase
    .from('patients')
    .select('*')
    .or(`Phone.ilike.%${last10},phone.ilike.%${last10}`);

  if (res.error && String(res.error.message).toLowerCase().includes('column')) {
    res = await supabase.from('patients').select('*').ilike('phone', `%${last10}`);
  }

  if (res.error) throw res.error;

  return (res.data || []).find((row) => phoneLast10(row) === last10) || null;
}

async function findPatientByEmail(supabase, email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;

  let res = await supabase
    .from('patients')
    .select('*')
    .or(`Email.ilike.${normalized},email.ilike.${normalized}`);

  if (res.error && String(res.error.message).toLowerCase().includes('column')) {
    res = await supabase.from('patients').select('*').ilike('email', normalized);
  }

  if (res.error) throw res.error;
  return (res.data || []).find((row) => getPatientEmail(row).toLowerCase() === normalized) || null;
}

async function insertPatient(supabase, payload) {
  let res = await supabase.from('patients').insert([{
    Name: payload.name,
    Phone: payload.phone,
    Email: payload.email,
    protocol: payload.protocol,
    notes: payload.notes,
    prefers_email: payload.prefers_email,
    prefers_sms: payload.prefers_sms,
  }]).select('id, Name, name, Phone, phone, Email, email');

  if (res.error && String(res.error.message).toLowerCase().includes('column')) {
    res = await supabase.from('patients').insert([{
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      protocol: payload.protocol,
      notes: payload.notes,
      prefers_email: payload.prefers_email,
      prefers_sms: payload.prefers_sms,
    }]).select('id, Name, name, Phone, phone, Email, email');
  }

  if (res.error) throw res.error;
  return res.data?.[0] || null;
}

async function updatePatient(supabase, id, patch) {
  let res = await supabase.from('patients').update({
    Name: patch.name,
    Phone: patch.phone,
    Email: patch.email,
    protocol: patch.protocol,
    notes: patch.notes,
    prefers_email: patch.prefers_email,
    prefers_sms: patch.prefers_sms,
  }).eq('id', id);

  if (res.error && String(res.error.message).toLowerCase().includes('column')) {
    res = await supabase.from('patients').update({
      name: patch.name,
      phone: patch.phone,
      email: patch.email,
      protocol: patch.protocol,
      notes: patch.notes,
      prefers_email: patch.prefers_email,
      prefers_sms: patch.prefers_sms,
    }).eq('id', id);
  }

  if (res.error) throw res.error;
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
      email: getPatientEmail(existing) || trimmedEmail,
    });

    return {
      id: existing.id,
      displayName: getPatientName(existing),
      phone: trimmedPhone,
      email: getPatientEmail(existing) || trimmedEmail,
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
