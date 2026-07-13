/**
 * Motor compartido GDL + Shenandoah: un expediente por teléfono (por clínica).
 * GDL usa columnas legacy (Name, Phone, Email); otras instancias pueden usar minúsculas.
 */

import { sanitizePatientNotesForDisplay } from './patientNotes.js';

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

/** Vincula cita ↔ expediente por nombre; si el nombre en cita quedó viejo, por teléfono. */
export function resolvePatientForAppointment(app, patients = []) {
  if (!app) return null;

  const appLast10 = digitsOnly(app?.phone).slice(-10);
  const matches = (patients || []).filter(
    (p) => normalizeStr(p.patient) === normalizeStr(app?.patient),
  );

  if (matches.length === 1) return matches[0];

  if (matches.length > 1) {
    if (appLast10.length === 10) {
      const byPhone = matches.find((p) => digitsOnly(p.phone).slice(-10) === appLast10);
      if (byPhone) return byPhone;
    }
    return matches.find((p) => p.notes && String(p.notes).trim() !== '') || matches[0];
  }

  if (appLast10.length === 10) {
    const byPhoneOnly = (patients || []).filter(
      (p) => digitsOnly(p.phone).slice(-10) === appLast10,
    );
    if (byPhoneOnly.length === 1) return byPhoneOnly[0];
  }

  return null;
}

export function resolveDisplayContact(app, patient) {
  const appPhone = String(app?.phone || '').trim();
  const appEmail = String(app?.email || '').trim();
  if (!patient) {
    return { phone: appPhone, email: appEmail };
  }
  return {
    phone: String(patient.phone || '').trim() || appPhone,
    email: String(patient.email || '').trim() || appEmail,
  };
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
      const err = new Error(res.error.message || 'Database error');
      err.sessionExpired = res.error.sessionExpired === true;
      throw err;
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
      const err = new Error(res.error.message || 'Database error');
      err.sessionExpired = res.error.sessionExpired === true;
      throw err;
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
    if (!isMissingColumnError(res.error)) {
      const err = new Error(res.error.message || 'Database error');
      err.sessionExpired = res.error.sessionExpired === true;
      throw err;
    }
  }
  return null;
}

async function updatePatient(supabase, id, patch) {
  for (const schema of PATIENT_SCHEMAS) {
    const res = await supabase.from('patients').update(buildPatientRow(schema, patch)).eq('id', id);
    if (!res.error) return;
    if (!isMissingColumnError(res.error)) {
      const err = new Error(res.error.message || 'Database error');
      err.sessionExpired = res.error.sessionExpired === true;
      throw err;
    }
  }
}

function buildPatientContactPatch(schema, { phone, email, notes, prefers_email, prefers_sms }) {
  const row = {
    notes: notes ?? '',
    prefers_email: prefers_email !== false,
    prefers_sms: prefers_sms !== false,
  };
  if (phone) row[schema.phone] = phone;
  if (email !== undefined && email !== null) row[schema.email] = email;
  return row;
}

/** Actualiza teléfono/correo/notas sin mezclar columnas Phone vs phone (GDL vs TX). */
export async function updatePatientContact(supabase, id, fields) {
  let lastError = null;
  for (const schema of PATIENT_SCHEMAS) {
    const res = await supabase
      .from('patients')
      .update(buildPatientContactPatch(schema, fields))
      .eq('id', id);
    if (!res.error) return { error: null };
    if (!isMissingColumnError(res.error)) return { error: res.error };
    lastError = res.error;
  }
  return { error: lastError || new Error('No se pudo actualizar el expediente') };
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

  try {
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
    const aliasNote = getPatientName(existing) !== trimmedName ? `Alias web: ${trimmedName}` : '';
    const requestedNotes = notes != null ? String(notes).trim() : null;
    const nextNotes = requestedNotes !== null
      ? [aliasNote, requestedNotes].filter(Boolean).join(' · ')
      : sanitizePatientNotesForDisplay(existing.notes || existing.Notes || '');

    await updatePatient(supabase, existing.id, {
      ...basePatch,
      name: getPatientName(existing),
      notes: nextNotes,
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
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(err?.message || 'Error de expediente') };
  }
}
