import { normalizeStr } from './ensurePatient.js';
import { insertAuditLog } from './auditLog.js';

function patientDisplayName(row) {
  return String(row?.Name || row?.name || row?.Nombre || row?.patient || '').trim();
}

function scoreKeeper(row) {
  const sessions = Number(row?.historico_sesiones) || 0;
  const blockedPenalty = row?.is_blocked ? -100000 : 0;
  const wallet = row?.wallets && typeof row.wallets === 'object'
    ? Object.values(row.wallets).reduce((s, n) => s + (Number(n) || 0), 0)
    : 0;
  return blockedPenalty + sessions * 100 + wallet;
}

/**
 * Prefer an unblocked chart with more history when merging duplicates.
 */
export function pickKeeperPatient(rows = []) {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => {
    const scoreDiff = scoreKeeper(b) - scoreKeeper(a);
    if (scoreDiff !== 0) return scoreDiff;
    const aCreated = String(a.created_at || '');
    const bCreated = String(b.created_at || '');
    return aCreated.localeCompare(bCreated);
  })[0];
}

/**
 * Delete one patient chart. Reassigns appointments.patient_id to keepPatientId (or null).
 * Clears session_group_id on the deleted row before delete.
 */
export async function deletePatientChart(supabase, {
  patientId,
  keepPatientId = null,
  changedBy = 'Sistema',
  reason = 'Eliminar duplicado',
} = {}) {
  const id = String(patientId || '').trim();
  if (!id) return { ok: false, error: 'missing_patient_id' };
  if (keepPatientId != null && String(keepPatientId) === id) {
    return { ok: false, error: 'keep_same_as_delete' };
  }

  const { data: row, error: loadErr } = await supabase
    .from('patients')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message };
  if (!row) return { ok: false, error: 'patient_not_found' };

  const name = patientDisplayName(row) || 'Sin nombre';
  let reassigned = 0;

  if (keepPatientId) {
    const { data: updated, error: reErr } = await supabase
      .from('appointments')
      .update({ patient_id: keepPatientId })
      .eq('patient_id', id)
      .select('id');
    if (reErr && !/column|patient_id|schema cache/i.test(reErr.message || '')) {
      return { ok: false, error: reErr.message };
    }
    reassigned = Array.isArray(updated) ? updated.length : 0;
  } else {
    const { data: cleared, error: clearErr } = await supabase
      .from('appointments')
      .update({ patient_id: null })
      .eq('patient_id', id)
      .select('id');
    if (clearErr && !/column|patient_id|schema cache/i.test(clearErr.message || '')) {
      return { ok: false, error: clearErr.message };
    }
    reassigned = Array.isArray(cleared) ? cleared.length : 0;
  }

  if (row.session_group_id) {
    await supabase.from('patients').update({ session_group_id: null }).eq('id', id);
  }

  const { error: delErr } = await supabase.from('patients').delete().eq('id', id);
  if (delErr) return { ok: false, error: delErr.message };

  await insertAuditLog(supabase, {
    patientName: name,
    action: 'ELIMINAR EXPEDIENTE',
    changedBy,
    details: `${reason} · id=${id}${keepPatientId ? ` · keep=${keepPatientId}` : ''} · citas_reasignadas=${reassigned}`,
  });

  return {
    ok: true,
    deletedId: id,
    deletedName: name,
    keepPatientId: keepPatientId || null,
    reassignedAppointments: reassigned,
  };
}

/** Strict name match for duplicate repair — avoids merging all "Lucia *" patients. */
export function patientNameMatchesRepairQuery(patientName, nameQuery) {
  const n = normalizeStr(patientName);
  const needle = normalizeStr(nameQuery);
  if (!needle || !n) return false;
  if (n === needle) return true;
  const minLen = Math.min(n.length, needle.length);
  const maxLen = Math.max(n.length, needle.length);
  // Allow minor spelling gaps only for long, specific queries (e.g. "lucia torres santa").
  if (minLen >= 14 && maxLen - minLen <= 4) {
    if (n.includes(needle) || needle.includes(n)) return true;
  }
  return false;
}

async function finishRepair(data, needle, supabase, changedBy, { dryRun = false } = {}) {
  const matches = (data || []).filter((row) =>
    patientNameMatchesRepairQuery(patientDisplayName(row), needle),
  );

  if (matches.length < 2) {
    return {
      ok: true,
      skipped: true,
      reason: matches.length === 0 ? 'not_found' : 'no_duplicate',
      matches: matches.map((m) => ({
        id: m.id,
        name: patientDisplayName(m),
        is_blocked: !!m.is_blocked,
        historico_sesiones: m.historico_sesiones || 0,
      })),
    };
  }

  const keeper = pickKeeperPatient(matches);
  const discarded = matches.filter((m) => String(m.id) !== String(keeper.id));

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      keeper: {
        id: keeper.id,
        name: patientDisplayName(keeper),
        is_blocked: !!keeper.is_blocked,
        historico_sesiones: keeper.historico_sesiones || 0,
      },
      wouldDelete: discarded.map((m) => ({
        id: m.id,
        name: patientDisplayName(m),
        is_blocked: !!m.is_blocked,
        historico_sesiones: m.historico_sesiones || 0,
      })),
      matchCount: matches.length,
    };
  }

  const deleted = [];

  for (const row of discarded) {
    const result = await deletePatientChart(supabase, {
      patientId: row.id,
      keepPatientId: keeper.id,
      changedBy,
      reason: `Duplicado de «${patientDisplayName(keeper)}»`,
    });
    deleted.push(result);
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        keeper: { id: keeper.id, name: patientDisplayName(keeper) },
        deleted,
      };
    }
  }

  return {
    ok: true,
    keeper: {
      id: keeper.id,
      name: patientDisplayName(keeper),
      is_blocked: !!keeper.is_blocked,
      historico_sesiones: keeper.historico_sesiones || 0,
    },
    deleted,
    matchCount: matches.length,
  };
}

/**
 * Find duplicate charts by normalized name and delete all but the keeper.
 */
export async function repairDuplicatePatientsByName(supabase, {
  nameQuery,
  changedBy = 'Sistema',
  dryRun = false,
} = {}) {
  const needle = normalizeStr(nameQuery);
  if (!needle || needle.length < 8) {
    return { ok: false, error: 'name_too_short', minChars: 8 };
  }

  // GDL uses Name/Phone/Email; optional columns vary — select * then filter in memory.
  const { data, error } = await supabase.from('patients').select('*');
  if (error) return { ok: false, error: error.message };
  return finishRepair(data || [], needle, supabase, changedBy, { dryRun });
}

/**
 * Booking block check that does not let a blocked namesake block a different chart id.
 */
export function isPatientBlockedForScheduling(slot, patients = []) {
  if (!slot?.patient && !slot?.patientId && !slot?.patient_id) return false;
  const pid = slot.patientId ?? slot.patient_id;
  if (pid != null && String(pid).trim() !== '') {
    const byId = (patients || []).find((p) => String(p.id) === String(pid));
    if (byId) return !!byId.is_blocked;
    return false;
  }
  const matches = (patients || []).filter(
    (p) => normalizeStr(p.patient) === normalizeStr(slot.patient),
  );
  if (!matches.length) return !!slot.is_blocked;
  // Freehand / no id: only block if every chart with that name is blocked.
  return matches.every((p) => !!p.is_blocked);
}

/** Prefer unblocked chart when resolving by name among duplicates. */
export function preferUnblockedPatient(matches = []) {
  if (!matches.length) return null;
  return matches.find((p) => !p.is_blocked) || matches[0];
}
