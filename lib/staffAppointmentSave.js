/** Notas cuando las columnas override aún no existen en Supabase. */
export function appointmentOverrideNote(outside, extended) {
  const parts = [];
  if (outside) parts.push('[FUERA DE HORARIO]');
  if (extended) parts.push('[EXTENDIDA 3H]');
  return parts.join(' ');
}

export function isMissingOverrideColumnsError(error) {
  if (!error?.message) return false;
  return /outside_normal_hours|is_extended_block|column|schema cache/i.test(error.message);
}

export async function insertStaffAppointment(supabase, payload) {
  let { data, error } = await supabase.from('appointments').insert([payload]).select();

  if (!error) return { data, error: null };

  if (isMissingOverrideColumnsError(error)) {
    const { outside_normal_hours, is_extended_block, notes, ...rest } = payload;
    const flagNote = appointmentOverrideNote(outside_normal_hours, is_extended_block);
    const mergedNotes = [flagNote, notes].filter(Boolean).join('\n');
    ({ data, error } = await supabase.from('appointments').insert([{ ...rest, notes: mergedNotes }]).select());
  }

  return { data, error };
}

export async function updateStaffAppointment(supabase, id, payload) {
  let { data, error } = await supabase.from('appointments').update(payload).eq('id', id).select();

  if (!error) return { data, error: null };

  if (isMissingOverrideColumnsError(error)) {
    const { outside_normal_hours, is_extended_block, notes, ...rest } = payload;
    const flagNote = appointmentOverrideNote(outside_normal_hours, is_extended_block);
    const mergedNotes = [flagNote, notes].filter(Boolean).join('\n');
    ({ data, error } = await supabase.from('appointments').update({ ...rest, notes: mergedNotes }).eq('id', id).select());
  }

  return { data, error };
}
