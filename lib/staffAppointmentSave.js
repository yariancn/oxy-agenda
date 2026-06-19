/** Notas cuando las columnas override aún no existen en Supabase. */
export function appointmentOverrideNote(outside, extended) {
  const parts = [];
  if (outside) parts.push('[FUERA DE HORARIO]');
  if (extended) parts.push('[EXTENDIDA 3H]');
  return parts.join(' ');
}

const OVERRIDE_KEYS = ['outside_normal_hours', 'is_extended_block'];

/** Columnas opcionales que varían entre GDL y TX (p. ej. email no existe en ninguna). */
const OPTIONAL_APPOINTMENT_KEYS = new Set([
  'email',
  'Email',
  'appointment_date',
  'appointment_time',
  'promoter_code',
  ...OVERRIDE_KEYS,
]);

function isSchemaCacheError(error) {
  return !!error?.message && /column|schema cache/i.test(error.message);
}

function extractMissingColumn(error) {
  if (!error?.message) return null;
  const msg = error.message;
  const quoted = msg.match(/Could not find the '([^']+)' column/i);
  if (quoted) return quoted[1];
  const dotted = msg.match(/column appointments\.(\w+) does not exist/i);
  if (dotted) return dotted[1];
  return null;
}

function mergeOverrideFlagsIntoNotes(payload) {
  const { outside_normal_hours, is_extended_block, notes, ...rest } = payload;
  const flagNote = appointmentOverrideNote(outside_normal_hours, is_extended_block);
  const mergedNotes = [flagNote, notes].filter(Boolean).join('\n');
  return { ...rest, notes: mergedNotes };
}

function stripKey(payload, key) {
  if (!(key in payload)) return payload;
  const next = { ...payload };
  delete next[key];
  return next;
}

async function saveWithSchemaFallback(supabase, mode, { id, payload }) {
  let current = { ...payload };
  let overrideMerged = false;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const query = supabase.from('appointments');
    const result = mode === 'insert'
      ? await query.insert([current]).select()
      : await query.update(current).eq('id', id).select();

    if (!result.error) return { data: result.data, error: null };

    const { error } = result;
    if (!isSchemaCacheError(error)) return { data: null, error };

    const missing = extractMissingColumn(error);
    if (!missing) return { data: null, error };

    if (OVERRIDE_KEYS.includes(missing) && !overrideMerged) {
      current = mergeOverrideFlagsIntoNotes(current);
      overrideMerged = true;
      continue;
    }

    if (missing in current) {
      current = stripKey(current, missing);
      continue;
    }

    if (OPTIONAL_APPOINTMENT_KEYS.has(missing)) {
      continue;
    }

    return { data: null, error };
  }

  return { data: null, error: new Error('No se pudo guardar la cita: esquema incompatible') };
}

export async function insertStaffAppointment(supabase, payload) {
  return saveWithSchemaFallback(supabase, 'insert', { payload });
}

export async function updateStaffAppointment(supabase, id, payload) {
  return saveWithSchemaFallback(supabase, 'update', { id, payload });
}
