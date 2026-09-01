import {
  digitsOnly,
  normalizeStr,
  pickBestPatientRow,
} from './ensurePatient.js';
import { insertAuditLog } from './auditLog.js';
import { patientNameMatchesRepairQuery } from './deletePatientChart.js';

function patientDisplayName(row) {
  return String(row?.Name || row?.name || row?.Nombre || row?.patient || '').trim();
}

function patientPhone(row) {
  return String(row?.Phone || row?.phone || '').trim();
}

function patientEmail(row) {
  return String(row?.Email || row?.email || '').trim();
}

function parseAuditDetail(details, key) {
  const text = String(details || '');
  const match = text.match(new RegExp(`${key}=([^\\s·]+)`));
  return match ? match[1].trim() : null;
}

function isLuciaTorresDuplicateName(name) {
  const n = normalizeStr(name);
  return n.includes('lucia') && n.includes('torres');
}

const PATIENT_SCHEMAS = [
  { name: 'Name', phone: 'Phone', email: 'Email' },
  { name: 'name', phone: 'phone', email: 'email' },
];

async function insertPatientRow(supabase, payload) {
  for (const schema of PATIENT_SCHEMAS) {
    const row = {
      [schema.name]: payload.name,
      [schema.phone]: payload.phone,
      [schema.email]: payload.email || '',
      protocol: payload.protocol || 'Wellness',
      notes: payload.notes || '',
      prefers_email: payload.prefers_email !== false,
      prefers_sms: payload.prefers_sms === true,
      prefers_sms_reminder: payload.prefers_sms_reminder !== false,
      historico_sesiones: payload.historico_sesiones || 0,
    };
    if (payload.id) row.id = payload.id;
    const res = await supabase.from('patients').insert([row]).select('*').maybeSingle();
    if (!res.error && res.data) return res.data;
    if (res.error && !/column|schema cache/i.test(res.error.message || '')) {
      throw new Error(res.error.message);
    }
  }
  throw new Error('No se pudo restaurar expediente');
}

function aggregateFromAppointments(apps = []) {
  const phoneCounts = new Map();
  const emailCounts = new Map();
  for (const app of apps) {
    const p10 = digitsOnly(app.phone || app.Phone).slice(-10);
    if (p10.length === 10) phoneCounts.set(p10, (phoneCounts.get(p10) || 0) + 1);
    const em = String(app.email || app.Email || '').trim().toLowerCase();
    if (em) emailCounts.set(em, (emailCounts.get(em) || 0) + 1);
  }
  const bestPhone = [...phoneCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const bestEmail = [...emailCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  return {
    phone: bestPhone,
    email: bestEmail,
    historico_sesiones: apps.length,
  };
}

/**
 * Restore patient charts wrongly deleted by broad duplicate repair.
 * Re-links appointments by snapshot name (patient column), not only patient_id.
 */
export async function restoreDeletedPatients(supabase, {
  dryRun = false,
  changedBy = 'Sistema',
} = {}) {
  const [{ data: patients, error: pErr }, { data: appointments, error: aErr }, { data: audits, error: audErr }] =
    await Promise.all([
      supabase.from('patients').select('*'),
      supabase.from('appointments').select('*'),
      supabase.from('audit_logs')
        .select('*')
        .eq('action', 'ELIMINAR EXPEDIENTE')
        .order('timestamp', { ascending: false })
        .limit(200),
    ]);

  if (pErr) throw new Error(pErr.message);
  if (aErr) throw new Error(aErr.message);
  if (audErr) throw new Error(audErr.message);

  const patientById = new Map((patients || []).map((p) => [String(p.id), p]));
  const restored = [];
  const relinked = [];
  const skipped = [];
  const seenRestoreNames = new Set();

  const restoreOne = async ({
    deletedId,
    deletedName,
    keepId,
    reason,
    allowEmpty = false,
    defaultPhone = '',
  }) => {
    const nameKey = normalizeStr(deletedName);
    if (!nameKey || seenRestoreNames.has(nameKey)) {
      skipped.push({ deletedName, reason: 'already_processed' });
      return;
    }

    if (deletedId && patientById.has(String(deletedId))) {
      skipped.push({ deletedName, reason: 'still_exists' });
      return;
    }

    const keeper = keepId ? patientById.get(String(keepId)) : null;
    const keeperName = keeper ? patientDisplayName(keeper) : '';
    const sameNameAsKeeper = keeperName && normalizeStr(keeperName) === nameKey;

    // Legitimate Lucia Torres duplicate removal (same name merged into keeper).
    if (sameNameAsKeeper && isLuciaTorresDuplicateName(deletedName)) {
      skipped.push({ deletedName, reason: 'lucia_torres_duplicate_ok' });
      return;
    }
    if (sameNameAsKeeper) {
      skipped.push({ deletedName, reason: 'same_name_duplicate_ok' });
      return;
    }

    let relatedApps = (appointments || []).filter(
      (app) => normalizeStr(app.patient || app.Name) === nameKey,
    );

    // Orphan patient_id pointing at deleted chart — snapshot name may differ; include by id.
    if (deletedId) {
      const byDeletedId = (appointments || []).filter(
        (app) => String(app.patient_id) === String(deletedId),
      );
      relatedApps = [...new Map([...relatedApps, ...byDeletedId].map((a) => [a.id, a])).values()];
    }

    if (!relatedApps.length && !allowEmpty) {
      skipped.push({ deletedName, reason: 'no_appointments' });
      return;
    }

    const agg = relatedApps.length
      ? aggregateFromAppointments(relatedApps)
      : { phone: digitsOnly(defaultPhone).slice(-10), email: '', historico_sesiones: 0 };
    const phoneDisplay = agg.phone
      ? (String(defaultPhone).trim() || (agg.phone.length === 10 ? `+52 ${agg.phone}` : agg.phone))
      : (relatedApps[0]?.phone || relatedApps[0]?.Phone || String(defaultPhone).trim() || '');

    seenRestoreNames.add(nameKey);

    if (dryRun) {
      restored.push({
        dryRun: true,
        deletedId,
        deletedName,
        keepId,
        appointmentCount: relatedApps.length,
        phone: phoneDisplay,
        reason,
      });
      return;
    }

    const row = await insertPatientRow(supabase, {
      id: deletedId || undefined,
      name: deletedName,
      phone: phoneDisplay,
      email: agg.email,
      historico_sesiones: agg.historico_sesiones,
      notes: `Restaurado ${new Date().toISOString().slice(0, 10)} · ${reason}`,
    });

    patientById.set(String(row.id), row);
    restored.push({
      id: row.id,
      name: deletedName,
      phone: phoneDisplay,
      appointmentCount: relatedApps.length,
      reason,
    });

    for (const app of relatedApps) {
      if (String(app.patient_id) === String(row.id)) continue;
      const { error } = await supabase
        .from('appointments')
        .update({ patient_id: row.id })
        .eq('id', app.id);
      if (!error) {
        relinked.push({ appointmentId: app.id, patientId: row.id, patientName: deletedName });
      }
    }

    await insertAuditLog(supabase, {
      patientName: deletedName,
      action: 'RESTAURAR EXPEDIENTE',
      changedBy,
      details: `id=${row.id} · citas=${relatedApps.length} · ${reason}`,
    });
  };

  // 1) Restore from delete audit logs (wrong merges: deleted name ≠ keeper name).
  for (const audit of audits || []) {
    const deletedId = parseAuditDetail(audit.details, 'id');
    const keepId = parseAuditDetail(audit.details, 'keep');
    const deletedName = String(audit.patient_name || '').trim();
    if (!deletedName) continue;

    const keeper = keepId ? patientById.get(String(keepId)) : null;
    const keeperName = keeper ? patientDisplayName(keeper) : '';
    if (keeper && normalizeStr(keeperName) === normalizeStr(deletedName)) {
      if (isLuciaTorresDuplicateName(deletedName)) {
        skipped.push({ deletedName, reason: 'lucia_torres_duplicate_ok' });
      } else {
        skipped.push({ deletedName, reason: 'same_name_duplicate_ok' });
      }
      continue;
    }

    await restoreOne({
      deletedId,
      deletedName,
      keepId,
      reason: 'audit_wrong_merge',
      allowEmpty: true,
    });
  }

  // 2) Restore from mislinked appointments (patient_id → wrong chart, snapshot name differs).
  const mislinkedByName = new Map();
  for (const app of appointments || []) {
    const appName = String(app.patient || app.Name || '').trim();
    const appKey = normalizeStr(appName);
    if (!appKey || appKey === 'sin nombre') continue;
    const linked = app.patient_id ? patientById.get(String(app.patient_id)) : null;
    const linkedName = linked ? normalizeStr(patientDisplayName(linked)) : '';
    if (linked && linkedName === appKey) continue;
    if (!mislinkedByName.has(appKey)) {
      mislinkedByName.set(appKey, { displayName: appName, apps: [] });
    }
    mislinkedByName.get(appKey).apps.push(app);
  }

  for (const [nameKey, { displayName, apps }] of mislinkedByName) {
    const exists = [...patientById.values()].some(
      (p) => normalizeStr(patientDisplayName(p)) === nameKey,
    );
    if (exists) {
      // Chart exists — just relink stray appointments.
      const chart = [...patientById.values()].find(
        (p) => normalizeStr(patientDisplayName(p)) === nameKey,
      );
      if (!dryRun && chart) {
        for (const app of apps) {
          if (String(app.patient_id) === String(chart.id)) continue;
          const { error } = await supabase
            .from('appointments')
            .update({ patient_id: chart.id })
            .eq('id', app.id);
          if (!error) {
            relinked.push({ appointmentId: app.id, patientId: chart.id, patientName: displayName });
          }
        }
      }
      continue;
    }

    await restoreOne({
      deletedId: null,
      deletedName: displayName,
      keepId: null,
      reason: 'mislinked_appointment',
    });
  }

  // 3) Restore charts visible on agenda but missing from Pacientes (by appointment name).
  const namesOnAgenda = new Map();
  for (const app of appointments || []) {
    const n = String(app.patient || '').trim();
    if (!n || normalizeStr(n) === 'sin nombre') continue;
    const key = normalizeStr(n);
    if (!namesOnAgenda.has(key)) namesOnAgenda.set(key, n);
  }

  for (const [nameKey, displayName] of namesOnAgenda) {
    const exists = [...patientById.values()].some(
      (p) => normalizeStr(patientDisplayName(p)) === nameKey,
    );
    if (exists) continue;

    await restoreOne({
      deletedId: null,
      deletedName: displayName,
      keepId: null,
      reason: 'missing_from_directory',
    });
  }

  // 5) Ensure Lucia Torres Santamaria keeper exists (canonical id from prior repairs).
  const LUCIA_TORRES_KEEPER_ID = '4334ab8b-a6c3-4bf5-b735-f90f8bf675d8';
  const hasLuciaTorres = [...patientById.values()].some((p) =>
    isLuciaTorresDuplicateName(patientDisplayName(p)),
  );
  if (!hasLuciaTorres) {
    await restoreOne({
      deletedId: LUCIA_TORRES_KEEPER_ID,
      deletedName: 'Lucia Torres Santamaria',
      keepId: null,
      reason: 'lucia_torres_keeper',
      allowEmpty: true,
      defaultPhone: '998 203 2660',
    });
  }

  // 6) Ensure single Lucia Torres (remove extras if any reappeared).
  const luciaTorres = [...patientById.values()].filter((p) =>
    patientNameMatchesRepairQuery(patientDisplayName(p), 'lucia torres santamaria'),
  );
  let luciaTorresDeduped = 0;
  if (luciaTorres.length > 1) {
    const keeper = pickBestPatientRow(luciaTorres);
    for (const extra of luciaTorres) {
      if (String(extra.id) === String(keeper.id)) continue;
      const apps = (appointments || []).filter(
        (a) => normalizeStr(a.patient) === normalizeStr(patientDisplayName(extra)),
      );
      if (!dryRun) {
        for (const app of apps) {
          await supabase.from('appointments').update({ patient_id: keeper.id }).eq('id', app.id);
        }
        await supabase.from('patients').delete().eq('id', extra.id);
        patientById.delete(String(extra.id));
      }
      luciaTorresDeduped += 1;
    }
  }

  // 7) Backfill phones for restored charts still missing phone.
  for (const row of [...patientById.values()]) {
    const name = patientDisplayName(row);
    const last10 = digitsOnly(patientPhone(row)).slice(-10);
    if (last10.length === 10) continue;
    const nameKey = normalizeStr(name);
    const apps = (appointments || []).filter(
      (a) => normalizeStr(a.patient || a.Name) === nameKey,
    );
    let phone = apps[0]?.phone || apps[0]?.Phone || '';
    if (!phone && isLuciaTorresDuplicateName(name)) {
      phone = '998 203 2660';
    }
    const p10 = digitsOnly(phone).slice(-10);
    if (p10.length !== 10) continue;
    const formatted = phone.trim() || `+52 ${p10}`;
    if (!dryRun) {
      for (const col of ['Phone', 'phone']) {
        const { error } = await supabase.from('patients').update({ [col]: formatted }).eq('id', row.id);
        if (!error) break;
      }
    }
  }

  const { count: finalCount } = await supabase
    .from('patients')
    .select('*', { count: 'exact', head: true });

  const luciaAppNames = [...new Set(
    (appointments || [])
      .filter((a) => normalizeStr(a.patient || '').includes('lucia'))
      .map((a) => String(a.patient || '').trim())
      .filter(Boolean),
  )];

  return {
    ok: true,
    dryRun,
    patientsBefore: (patients || []).length,
    patientsAfter: dryRun ? (patients || []).length + restored.length : (finalCount ?? patientById.size),
    restored,
    relinked: dryRun ? [] : relinked,
    skipped,
    luciaAppNames,
    mislinkedNames: [...mislinkedByName.keys()],
    luciaTorresCount: [...patientById.values()].filter((p) =>
      isLuciaTorresDuplicateName(patientDisplayName(p)),
    ).length,
    luciaTorresDeduped,
  };
}
