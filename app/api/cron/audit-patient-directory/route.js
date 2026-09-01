import { NextResponse } from 'next/server';
import { authorizeCron } from '../../../../lib/cronAuth.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { CLINIC_OXYGENDGL } from '../../../../lib/clinicRegistry.js';
import { normalizeStr, digitsOnly } from '../../../../lib/ensurePatient.js';
import { repairOrphanAppointmentPatients } from '../../../../lib/repairOrphanAppointmentPatients.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function patientName(row) {
  return String(row?.Name || row?.name || row?.Nombre || row?.patient || '').trim();
}

/**
 * Directory audit + rebuild missing charts from all appointments.
 * GET ?repair=1 — create missing patient rows from appointment names
 */
export async function GET(request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const runRepair = searchParams.get('repair') === '1';
  const lookbackDays = Number(searchParams.get('lookbackDays') || 3650) || 3650;

  try {
    const supabase = getSupabaseAdmin(CLINIC_OXYGENDGL);

    const [{ count: patientCount }, { data: patientsRaw, error: pErr }, { data: deleteAudits }] =
      await Promise.all([
        supabase.from('patients').select('*', { count: 'exact', head: true }),
        supabase.from('patients').select('*'),
        supabase.from('audit_logs')
          .select('patient_name, action, details, timestamp')
          .eq('action', 'ELIMINAR EXPEDIENTE')
          .order('timestamp', { ascending: false })
          .limit(500),
      ]);
    if (pErr) throw new Error(pErr.message);

    const patients = patientsRaw || [];
    const appointments = [];
    let from = 0;
    const step = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, patient, phone, patient_id, full_date')
        .order('id', { ascending: true })
        .range(from, from + step - 1);
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      appointments.push(...data);
      if (data.length < step) break;
      from += step;
    }

    const namesOnAppointments = new Map();
    for (const app of appointments || []) {
      const n = String(app.patient || '').trim();
      if (!n || normalizeStr(n) === 'sin nombre') continue;
      const key = normalizeStr(n);
      if (!namesOnAppointments.has(key)) {
        namesOnAppointments.set(key, { displayName: n, count: 0, withPhone: 0 });
      }
      const entry = namesOnAppointments.get(key);
      entry.count += 1;
      if (digitsOnly(app.phone).slice(-10).length === 10) entry.withPhone += 1;
    }

    const namesInDirectory = new Set(
      (patients || []).map((p) => normalizeStr(patientName(p))).filter(Boolean),
    );

    const missingFromDirectory = [];
    for (const [key, info] of namesOnAppointments) {
      if (!namesInDirectory.has(key)) {
        missingFromDirectory.push({
          name: info.displayName,
          appointmentCount: info.count,
          appointmentsWithPhone: info.withPhone,
        });
      }
    }
    missingFromDirectory.sort((a, b) => b.appointmentCount - a.appointmentCount);

    let repair = null;
    if (runRepair) {
      repair = await repairOrphanAppointmentPatients(supabase, { lookbackDays });
    }

    const { count: patientCountAfter } = runRepair
      ? await supabase.from('patients').select('*', { count: 'exact', head: true })
      : { count: patientCount };

    return NextResponse.json({
      ok: true,
      clinic: CLINIC_OXYGENDGL,
      patientsInDatabase: patientCount,
      patientsAfterRepair: patientCountAfter,
      appointmentsTotal: (appointments || []).length,
      uniqueNamesOnAppointments: namesOnAppointments.size,
      namesInDirectory: namesInDirectory.size,
      missingChartsCount: missingFromDirectory.length,
      missingChartsSample: missingFromDirectory.slice(0, 40),
      deleteAuditCount: (deleteAudits || []).length,
      recentDeletes: (deleteAudits || []).slice(0, 15).map((a) => ({
        name: a.patient_name,
        at: a.timestamp,
        details: a.details,
      })),
      repair,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || 'Audit failed' }, { status: 500 });
  }
}
