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

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function patientDisplayName(row) {
  return String(row?.patient || row?.Name || row?.name || row?.Nombre || '').trim();
}

/**
 * Same person already on file: same name + (same phone and/or same email).
 * Different name with shared phone/email is allowed after an explicit staff warning.
 */
export function isExactPatientDuplicate(existing, { name, phone, email } = {}) {
  if (!existing) return false;
  const sameName = normalizeStr(patientDisplayName(existing)) === normalizeStr(name);
  if (!sameName) return false;

  const inPhone = digitsOnly(phone).slice(-10);
  const exPhone = digitsOnly(existing.phone || getPatientPhone(existing)).slice(-10);
  const samePhone = inPhone.length === 10 && exPhone.length === 10 && inPhone === exPhone;

  const inEmail = normalizeEmail(email);
  const exEmail = normalizeEmail(existing.email || getPatientEmail(existing));
  const sameEmail = Boolean(inEmail && exEmail && inEmail === exEmail);

  return samePhone || sameEmail;
}

export function findLocalPatientConflicts(patients = [], { name, phone, email, excludeId } = {}) {
  const last10 = digitsOnly(phone).slice(-10);
  const emailNorm = normalizeEmail(email);
  const hits = [];

  for (const p of patients || []) {
    if (!p) continue;
    if (excludeId != null && String(p.id) === String(excludeId)) continue;

    const pPhone = digitsOnly(p.phone).slice(-10);
    const pEmail = normalizeEmail(p.email);
    const phoneMatch = last10.length === 10 && pPhone.length === 10 && pPhone === last10;
    const emailMatch = Boolean(emailNorm && pEmail && emailNorm === pEmail);
    if (!phoneMatch && !emailMatch) continue;

    hits.push({
      id: p.id,
      patient: patientDisplayName(p) || p.patient,
      phone: p.phone || '',
      email: p.email || '',
      phoneMatch,
      emailMatch,
      exact: isExactPatientDuplicate(p, { name, phone, email }),
      source: 'local',
    });
  }

  return hits;
}

function matchByLabel(conflict, locale = 'es') {
  const es = locale !== 'en';
  if (conflict?.phoneMatch && conflict?.emailMatch) {
    return es ? 'teléfono y correo' : 'phone and email';
  }
  if (conflict?.emailMatch) return es ? 'correo' : 'email';
  return es ? 'teléfono' : 'phone';
}

/**
 * Staff choice when phone/email already belongs to someone else (different name).
 * @returns {'use_existing' | 'create_new' | 'abort'}
 */
export function chooseSharedContactAction({
  existingName,
  typedName,
  matchBy = 'phone',
  locale = 'es',
} = {}) {
  const existing = String(existingName || '').trim() || '—';
  const typed = String(typedName || '').trim() || '—';
  const es = locale !== 'en';
  const via = matchBy === 'both'
    ? (es ? 'teléfono/correo' : 'phone/email')
    : matchBy === 'email'
      ? (es ? 'correo' : 'email')
      : (es ? 'teléfono' : 'phone');

  const useExisting = typeof window !== 'undefined' && window.confirm(
    es
      ? `Ya tenemos a «${existing}» con este ${via}.\n\nAceptar = usar ese paciente\nCancelar = ver opción de dar de alta a otro con el mismo ${via}`
      : `«${existing}» is already registered with this ${via}.\n\nOK = use that patient\nCancel = see option to register someone else`,
  );
  if (useExisting) return 'use_existing';

  const createNew = typeof window !== 'undefined' && window.confirm(
    es
      ? `¿Dar de alta a «${typed}» como paciente NUEVO con el mismo ${via}?\n\nAceptar = crear otro paciente\nCancelar = no guardar`
      : `Register «${typed}» as a NEW patient with the same ${via}?\n\nOK = create another patient\nCancel = don't save`,
  );
  return createNew ? 'create_new' : 'abort';
}

/** @deprecated use chooseSharedContactAction */
export function chooseDuplicatePhoneAction(opts = {}) {
  return chooseSharedContactAction({ ...opts, matchBy: opts.matchBy || 'phone' });
}

export function alertExactPatientDuplicate({ existingName, matchBy, locale = 'es' } = {}) {
  const existing = String(existingName || '').trim() || '—';
  const es = locale !== 'en';
  const via = matchBy || (es ? 'teléfono/correo' : 'phone/email');
  const msg = es
    ? `No se puede dar de alta otra vez: «${existing}» ya está registrado con el mismo nombre y ${via}.\n\nUsa el expediente existente.`
    : `Cannot create again: «${existing}» is already registered with the same name and ${via}.\n\nUse the existing chart.`;
  if (typeof window !== 'undefined') window.alert(msg);
  return msg;
}

/** Vincula cita ↔ expediente por id, luego nombre; si el nombre en cita quedó viejo, por teléfono. */
export function resolvePatientForAppointment(app, patients = []) {
  if (!app) return null;

  const pid = app.patient_id ?? app.patientId;
  if (pid != null && String(pid).trim() !== '') {
    const byId = (patients || []).find((p) => String(p.id) === String(pid));
    if (byId) return byId;
  }

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
    return matches.find((p) => !p.is_blocked)
      || matches.find((p) => p.notes && String(p.notes).trim() !== '')
      || matches[0];
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
  const row = {
    [schema.name]: payload.name,
    [schema.phone]: payload.phone,
    [schema.email]: payload.email,
    protocol: payload.protocol,
    notes: payload.notes,
    prefers_email: payload.prefers_email,
    prefers_sms: payload.prefers_sms,
  };
  if (payload.prefers_sms_reminder !== undefined) {
    row.prefers_sms_reminder = payload.prefers_sms_reminder;
  }
  return row;
}

export function pickBestPatientRow(rows = []) {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => {
    const aBlocked = a.is_blocked ? 1 : 0;
    const bBlocked = b.is_blocked ? 1 : 0;
    if (aBlocked !== bBlocked) return aBlocked - bBlocked;
    const aSes = Number(a.historico_sesiones) || 0;
    const bSes = Number(b.historico_sesiones) || 0;
    if (bSes !== aSes) return bSes - aSes;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  })[0];
}

/**
 * Find every chart with this 10-digit phone (handles "998 203 2660" vs "9982032660").
 * ilike on full 10 digits fails when Phone has spaces — use last-4 probe + JS filter.
 */
export async function findAllPatientsByPhoneLast10(supabase, last10) {
  if (last10.length !== 10) return [];
  const tail4 = last10.slice(-4);
  const byId = new Map();

  for (const col of ['Phone', 'phone']) {
    const res = await supabase.from('patients').select('*').ilike(col, `%${tail4}`);
    if (res.error) {
      if (isMissingColumnError(res.error)) continue;
      const err = new Error(res.error.message || 'Database error');
      err.sessionExpired = res.error.sessionExpired === true;
      throw err;
    }
    for (const row of res.data || []) {
      if (phoneLast10(row) !== last10) continue;
      byId.set(String(row.id), row);
    }
  }

  return [...byId.values()];
}

async function findPatientByPhone(supabase, last10) {
  const all = await findAllPatientsByPhoneLast10(supabase, last10);
  return pickBestPatientRow(all);
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

/** DB lookup of phone/email collisions for staff create/update. */
export async function findPatientContactConflicts(supabase, {
  name,
  phone,
  email,
  excludeId = null,
} = {}) {
  const hits = [];
  const last10 = digitsOnly(phone).slice(-10);
  const emailNorm = normalizeEmail(email);

  const pushHit = (row, { phoneMatch, emailMatch }) => {
    if (!row) return;
    if (excludeId != null && String(row.id) === String(excludeId)) return;
    const existing = hits.find((h) => String(h.id) === String(row.id));
    if (existing) {
      existing.phoneMatch = existing.phoneMatch || phoneMatch;
      existing.emailMatch = existing.emailMatch || emailMatch;
      existing.exact = isExactPatientDuplicate(row, { name, phone, email });
      return;
    }
    hits.push({
      id: row.id,
      patient: getPatientName(row),
      phone: getPatientPhone(row),
      email: getPatientEmail(row),
      phoneMatch: !!phoneMatch,
      emailMatch: !!emailMatch,
      exact: isExactPatientDuplicate(row, { name, phone, email }),
      source: 'db',
      row,
    });
  };

  if (last10.length === 10) {
    const byPhoneAll = await findAllPatientsByPhoneLast10(supabase, last10);
    for (const row of byPhoneAll) {
      pushHit(row, {
        phoneMatch: true,
        emailMatch: Boolean(emailNorm && normalizeEmail(getPatientEmail(row)) === emailNorm),
      });
    }
  }

  if (emailNorm) {
    const byEmail = await findPatientByEmail(supabase, emailNorm);
    if (byEmail) {
      pushHit(byEmail, {
        phoneMatch: last10.length === 10 && digitsOnly(getPatientPhone(byEmail)).slice(-10) === last10,
        emailMatch: true,
      });
    }
  }

  return hits;
}

/**
 * Staff create flow: block exact duplicates; warn on shared phone/email with a different name.
 * @returns {{
 *   action: 'proceed' | 'abort',
 *   forceCreate?: boolean,
 *   namePolicy?: 'keep_existing' | 'prefer_incoming',
 *   nameForSave?: string,
 *   existing?: object,
 *   reason?: string,
 * }}
 */
export async function resolveStaffPatientCreate({
  supabase,
  patients = [],
  name,
  phone,
  email = '',
  locale = 'es',
  excludeId = null,
} = {}) {
  const local = findLocalPatientConflicts(patients, { name, phone, email, excludeId });
  let dbHits = [];
  try {
    dbHits = await findPatientContactConflicts(supabase, { name, phone, email, excludeId });
  } catch (err) {
    return {
      action: 'abort',
      reason: 'lookup_error',
      error: err instanceof Error ? err : new Error(err?.message || 'Error buscando pacientes'),
    };
  }

  const byId = new Map();
  for (const hit of [...local, ...dbHits]) {
    const key = String(hit.id);
    const prev = byId.get(key);
    if (!prev) {
      byId.set(key, { ...hit });
      continue;
    }
    byId.set(key, {
      ...prev,
      ...hit,
      phoneMatch: prev.phoneMatch || hit.phoneMatch,
      emailMatch: prev.emailMatch || hit.emailMatch,
      exact: prev.exact || hit.exact,
    });
  }
  const conflicts = [...byId.values()];

  const exact = conflicts.find((c) => c.exact);
  if (exact) {
    alertExactPatientDuplicate({
      existingName: exact.patient,
      matchBy: matchByLabel(exact, locale),
      locale,
    });
    return { action: 'abort', reason: 'exact_duplicate', existing: exact };
  }

  const shared = conflicts.find((c) => c.phoneMatch) || conflicts.find((c) => c.emailMatch);
  if (!shared) {
    return {
      action: 'proceed',
      forceCreate: false,
      namePolicy: 'prefer_incoming',
      nameForSave: String(name || '').trim(),
    };
  }

  const matchBy = shared.phoneMatch && shared.emailMatch
    ? 'both'
    : shared.emailMatch
      ? 'email'
      : 'phone';
  const choice = chooseSharedContactAction({
    existingName: shared.patient,
    typedName: name,
    matchBy,
    locale,
  });
  if (choice === 'abort') {
    return { action: 'abort', reason: 'cancelled', existing: shared };
  }
  if (choice === 'use_existing') {
    return {
      action: 'proceed',
      forceCreate: false,
      namePolicy: 'keep_existing',
      nameForSave: shared.patient,
      existing: shared,
    };
  }
  if (choice === 'create_new') {
    if (normalizeStr(name) === normalizeStr(shared.patient)) {
      alertExactPatientDuplicate({
        existingName: shared.patient,
        matchBy,
        locale,
      });
      return { action: 'abort', reason: 'exact_duplicate', existing: shared };
    }
    return {
      action: 'proceed',
      forceCreate: true,
      namePolicy: 'prefer_incoming',
      nameForSave: String(name || '').trim(),
      existing: shared,
    };
  }
  return { action: 'abort', reason: 'cancelled', existing: shared };
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

function buildPatientContactPatch(schema, { phone, email, notes, prefers_email, prefers_sms, prefers_sms_reminder }) {
  const row = {
    notes: notes ?? '',
    prefers_email: prefers_email !== false,
    prefers_sms: prefers_sms === true,
    prefers_sms_reminder: prefers_sms_reminder !== false,
  };
  if (phone) row[schema.phone] = phone;
  if (email !== undefined && email !== null) row[schema.email] = email;
  return row;
}

/** Actualiza teléfono/correo/notas sin mezclar columnas Phone vs phone (GDL vs TX). */
export async function updatePatientContact(supabase, id, fields) {
  let lastError = null;
  for (const schema of PATIENT_SCHEMAS) {
    let row = buildPatientContactPatch(schema, fields);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const res = await supabase.from('patients').update(row).eq('id', id);
      if (!res.error) return { error: null };
      lastError = res.error;
      if (!isMissingColumnError(res.error)) break;
      const missing = extractMissingPatientColumn(res.error);
      if (missing && missing in row && OPTIONAL_PATIENT_KEYS.has(missing)) {
        const next = { ...row };
        delete next[missing];
        row = next;
        continue;
      }
      break;
    }
  }
  return { error: lastError || new Error('No se pudo actualizar el expediente') };
}

const OPTIONAL_PATIENT_KEYS = new Set([
  'prefers_email',
  'prefers_sms',
  'prefers_sms_reminder',
  'adeudo',
  'historico_sesiones',
  'package_history',
  'wallets',
  'session_group_id',
  'protocol',
  'notes',
  'block_reason',
  'Email',
  'email',
]);

/** Columns that must persist — never silently strip (blocking would look "saved" but not stick). */
const REQUIRED_PATIENT_KEYS = new Set(['is_blocked']);

function extractMissingPatientColumn(error) {
  if (!error?.message) return null;
  const msg = error.message;
  const quoted = msg.match(/Could not find the '([^']+)' column/i);
  if (quoted) return quoted[1];
  const dotted = msg.match(/column patients\.(\w+) does not exist/i);
  if (dotted) return dotted[1];
  return null;
}

/**
 * Full patient chart update with GDL (Name/Phone) then TX (name/phone) schemas.
 * Strips missing optional columns so prefers_* never silently fail the whole save.
 * is_blocked is required — never stripped (otherwise blocking looks saved but does not stick).
 */
export function validatePatientBlockFields({ is_blocked = false, block_reason = '' } = {}) {
  if (is_blocked && !String(block_reason || '').trim()) {
    return 'BLOCK_REASON_REQUIRED';
  }
  return null;
}

export async function updatePatientRecord(supabase, id, {
  name,
  phone,
  email = '',
  protocol = 'Wellness',
  notes = '',
  is_blocked = false,
  block_reason = '',
  prefers_email = true,
  prefers_sms = false,
  prefers_sms_reminder = true,
  wallets = null,
  packageHistory = null,
  historicoSesiones = null,
  adeudo = null,
} = {}) {
  const trimmedName = String(name || '').trim();
  if (!id) return { error: new Error('Paciente sin ID') };
  if (!trimmedName) return { error: new Error('Nombre requerido') };

  const blocked = !!is_blocked;
  const reason = String(block_reason || '').trim();
  const blockErr = validatePatientBlockFields({ is_blocked: blocked, block_reason: reason });
  if (blockErr) {
    return { error: new Error(blockErr) };
  }

  let lastError = null;
  for (const schema of PATIENT_SCHEMAS) {
    let row = {
      [schema.name]: trimmedName,
      [schema.phone]: String(phone || '').trim(),
      [schema.email]: String(email || '').trim(),
      protocol: protocol || 'Wellness',
      notes: notes ?? '',
      is_blocked: blocked,
      block_reason: blocked ? reason : '',
      prefers_email: prefers_email !== false,
      prefers_sms: prefers_sms === true,
      prefers_sms_reminder: prefers_sms_reminder !== false,
    };
    if (wallets != null) row.wallets = wallets;
    if (packageHistory != null) row.package_history = packageHistory;
    if (historicoSesiones != null) row.historico_sesiones = historicoSesiones;
    if (adeudo != null) row.adeudo = adeudo;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const res = await supabase.from('patients').update(row).eq('id', id);
      if (!res.error) {
        return {
          error: null,
          is_blocked: !!row.is_blocked,
          block_reason: String(row.block_reason || ''),
          prefers_email: row.prefers_email,
          prefers_sms: row.prefers_sms,
          prefers_sms_reminder: row.prefers_sms_reminder,
        };
      }
      lastError = res.error;
      if (!isMissingColumnError(res.error)) {
        // Wrong casing schema — try next PATIENT_SCHEMA
        break;
      }
      const missing = extractMissingPatientColumn(res.error);
      if (missing && REQUIRED_PATIENT_KEYS.has(missing)) {
        return {
          error: new Error(
            `Falta la columna patients.${missing} en la base. Ejecuta scripts/supabase-patient-block.sql en Supabase.`,
          ),
        };
      }
      if (missing && missing in row && OPTIONAL_PATIENT_KEYS.has(missing)) {
        const next = { ...row };
        delete next[missing];
        row = next;
        continue;
      }
      // Name/Phone casing mismatch → try next schema
      break;
    }
  }

  return { error: lastError || new Error('No se pudo guardar el expediente') };
}

/**
 * Busca por teléfono (prioridad) o email; crea o actualiza sin duplicar.
 * namePolicy:
 * - 'keep_existing' (default): if phone exists, keep chart name (public booking / aliases)
 * - 'prefer_incoming': staff typed a different name → update the chart name
 * forceCreate: skip phone/email match and insert a new row (staff chose "another patient, same phone").
 *
 * Safety: never silently rename another person's chart when the match is only by
 * phone/email and the typed name differs (returns SHARED_CONTACT for staff to handle).
 */
export async function ensurePatient(supabase, {
  name,
  phone,
  email = '',
  protocol = 'Wellness',
  notes = '',
  prefers_email = true,
  prefers_sms = false,
  prefers_sms_reminder = true,
  namePolicy = 'keep_existing',
  forceCreate = false,
  /** When false (default), existing charts keep their notify prefs (portal must not overwrite). */
  updateNotifyPrefs = false,
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
    let existing = null;
    let matchedBy = null;
    let creatingNew = forceCreate === true;
    if (!creatingNew) {
      existing = await findPatientByPhone(supabase, last10);
      if (existing) matchedBy = 'phone';
      if (!existing && trimmedEmail) {
        existing = await findPatientByEmail(supabase, trimmedEmail);
        if (existing) matchedBy = 'email';
      }
    } else {
      // Never insert another chart with the same name + phone (staff "duplicate" guard).
      const phoneDupes = await findAllPatientsByPhoneLast10(supabase, last10);
      const exactDupe = phoneDupes.find((row) =>
        isExactPatientDuplicate(row, { name: trimmedName, phone: trimmedPhone, email: trimmedEmail }),
      );
      if (exactDupe) {
        existing = exactDupe;
        matchedBy = 'phone';
        creatingNew = false;
      }
    }

  const basePatch = {
    name: trimmedName,
    phone: trimmedPhone,
    email: trimmedEmail,
    protocol: protocol || 'Wellness',
    notes: notes || '',
    prefers_email: prefers_email !== false,
    prefers_sms: prefers_sms === true,
    prefers_sms_reminder: prefers_sms_reminder !== false,
  };

  if (existing) {
    const existingName = getPatientName(existing);
    const nameDiffers = normalizeStr(existingName) !== normalizeStr(trimmedName);

    // Staff asked to apply a new name onto a different person's contact match → refuse.
    if (nameDiffers && namePolicy === 'prefer_incoming' && !creatingNew) {
      const err = new Error('SHARED_CONTACT');
      err.code = 'SHARED_CONTACT';
      err.existingId = existing.id;
      err.existingName = existingName;
      err.matchBy = matchedBy;
      return { error: err };
    }

    const canonicalName = (namePolicy === 'prefer_incoming' && trimmedName)
      ? trimmedName
      : existingName;
    const aliasNote = nameDiffers && namePolicy !== 'prefer_incoming'
      ? `Alias web: ${trimmedName}`
      : '';
    const requestedNotes = notes != null ? String(notes).trim() : null;
    const nextNotes = requestedNotes !== null
      ? [aliasNote, requestedNotes].filter(Boolean).join(' · ')
      : sanitizePatientNotesForDisplay(existing.notes || existing.Notes || '');

    const existingPatch = {
      name: canonicalName,
      phone: trimmedPhone,
      notes: nextNotes,
      email: trimmedEmail || getPatientEmail(existing),
      protocol: protocol || 'Wellness',
    };
    if (updateNotifyPrefs) {
      existingPatch.prefers_email = prefers_email !== false;
      existingPatch.prefers_sms = prefers_sms === true;
      existingPatch.prefers_sms_reminder = prefers_sms_reminder !== false;
    }

    await updatePatient(supabase, existing.id, existingPatch);

    return {
      id: existing.id,
      displayName: canonicalName,
      phone: trimmedPhone,
      email: trimmedEmail || getPatientEmail(existing),
      isNew: false,
      linkedExisting: true,
      previousName: existingName,
      nameUpdated: nameDiffers && canonicalName !== existingName,
      matchedBy,
      is_blocked: !!existing.is_blocked,
      block_reason: String(existing.block_reason || '').trim(),
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
    linkedExisting: false,
    forceCreated: creatingNew === true,
    is_blocked: false,
    block_reason: '',
  };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(err?.message || 'Error de expediente') };
  }
}

/** Lookup only — used by staff UI to warn before linking/renaming by phone. */
export async function findExistingPatientByPhone(supabase, phone) {
  const last10 = digitsOnly(phone).slice(-10);
  if (last10.length !== 10) return null;
  try {
    const row = await findPatientByPhone(supabase, last10);
    if (!row) return null;
    return {
      id: row.id,
      patient: getPatientName(row),
      phone: getPatientPhone(row),
      email: getPatientEmail(row),
      is_blocked: !!row.is_blocked,
      block_reason: String(row.block_reason || '').trim(),
    };
  } catch {
    return null;
  }
}

/** Lookup only — warn before linking/creating by email. */
export async function findExistingPatientByEmail(supabase, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  try {
    const row = await findPatientByEmail(supabase, normalized);
    if (!row) return null;
    return {
      id: row.id,
      patient: getPatientName(row),
      phone: getPatientPhone(row),
      email: getPatientEmail(row),
      is_blocked: !!row.is_blocked,
      block_reason: String(row.block_reason || '').trim(),
    };
  } catch {
    return null;
  }
}
