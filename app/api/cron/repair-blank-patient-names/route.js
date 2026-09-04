import { NextResponse } from 'next/server';
import { authorizeCron } from '../../../../lib/cronAuth.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { CLINIC_OXYGENDGL } from '../../../../lib/clinicRegistry.js';
import { liveSyncDateRange } from '../../../../lib/liveSyncToken.js';
import {
  repairBlankPatientNames,
  usablePatientDisplayName,
} from '../../../../lib/patientNameSync.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function fetchAll(supabase, table, select = '*', { dateCol, dateFrom, dateTo } = {}) {
  const all = [];
  let from = 0;
  const step = 1000;
  while (true) {
    let q = supabase.from(table).select(select).order('id', { ascending: true }).range(from, from + step - 1);
    if (dateCol && dateFrom) q = q.gte(dateCol, dateFrom);
    if (dateCol && dateTo) q = q.lte(dateCol, dateTo);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < step) break;
    from += step;
  }
  return all;
}

function mapPatient(row) {
  return {
    id: row.id,
    patient: String(row.Name || row.name || row.Nombre || '').trim(),
    phone: String(row.Phone || row.phone || '').trim(),
  };
}

function mapAppointment(row) {
  return {
    id: row.id,
    patient: row.patient,
    phone: row.phone,
    patient_id: row.patient_id,
    full_date: row.full_date,
    check_in_status: row.check_in_status,
  };
}

/**
 * Heal blank appointment/chart names in the live agenda window.
 * GET ?name=patricia  — optional filter sample
 */
export async function GET(request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const nameFilter = String(searchParams.get('name') || '').trim().toLowerCase();
  const dryRun = searchParams.get('dryRun') === '1';

  try {
    const supabase = getSupabaseAdmin(CLINIC_OXYGENDGL);
    const { from, to } = liveSyncDateRange(CLINIC_OXYGENDGL);

    const [patientsRaw, appointmentsRaw] = await Promise.all([
      fetchAll(supabase, 'patients', '*'),
      fetchAll(supabase, 'appointments', 'id, patient, phone, patient_id, full_date, check_in_status', {
        dateCol: 'full_date',
        dateFrom: from,
        dateTo: to,
      }),
    ]);

    const patients = (patientsRaw || []).map(mapPatient);
    const appointments = (appointmentsRaw || []).map(mapAppointment);

    const blankAppts = appointments.filter((a) => !usablePatientDisplayName(a.patient));
    const blankCharts = patients.filter((p) => !usablePatientDisplayName(p.patient));
    const sample = blankAppts
      .filter((a) => !nameFilter || String(a.phone || '').includes(nameFilter) || String(a.patient_id || '').includes(nameFilter))
      .slice(0, 20)
      .map((a) => ({
        id: a.id,
        date: a.full_date,
        patient_id: a.patient_id,
        phone: a.phone,
        chartName: patients.find((p) => String(p.id) === String(a.patient_id))?.patient || null,
      }));

    // Also find Patricia Donovan specifically for diagnostics
    const patriciaCharts = patients.filter((p) => /patricia/i.test(p.patient) && /donovan/i.test(p.patient));
    const patriciaAppts = appointments.filter((a) => {
      const n = String(a.patient || '');
      const chart = patients.find((p) => String(p.id) === String(a.patient_id));
      return /patricia/i.test(n) || /donovan/i.test(n)
        || (chart && /patricia/i.test(chart.patient) && /donovan/i.test(chart.patient))
        || (a.patient_id && patriciaCharts.some((p) => String(p.id) === String(a.patient_id)));
    });

    let repair = null;
    if (!dryRun) {
      repair = await repairBlankPatientNames(supabase, { appointments, patients });
    }

    return NextResponse.json({
      ok: true,
      window: { from, to },
      blankAppointments: blankAppts.length,
      blankCharts: blankCharts.length,
      blankSample: sample,
      patriciaCharts,
      patriciaAppts: patriciaAppts.map((a) => ({
        id: a.id,
        date: a.full_date,
        patient: a.patient,
        patient_id: a.patient_id,
        phone: a.phone,
        status: a.check_in_status,
      })),
      dryRun,
      repair,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || 'Repair failed' }, { status: 500 });
  }
}
