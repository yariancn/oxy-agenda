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
    time: row.time,
    equipment: row.equipment,
  };
}

/**
 * Heal blank appointment/chart names + diagnose Patricia Donovan-style blanks.
 * GET ?dryRun=1 — inspect only
 */
export async function GET(request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dryRun') === '1';

  try {
    const supabase = getSupabaseAdmin(CLINIC_OXYGENDGL);
    const { from, to } = liveSyncDateRange(CLINIC_OXYGENDGL);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

    const [
      patientsRaw,
      appointmentsRaw,
      todayRes,
      donovanApptRes,
      donovanPatRes,
    ] = await Promise.all([
      fetchAll(supabase, 'patients', '*'),
      fetchAll(supabase, 'appointments', 'id, patient, phone, patient_id, full_date, check_in_status, time, equipment', {
        dateCol: 'full_date',
        dateFrom: from,
        dateTo: to,
      }),
      supabase
        .from('appointments')
        .select('id, patient, phone, patient_id, full_date, check_in_status, time, equipment')
        .eq('full_date', today)
        .order('time'),
      supabase
        .from('appointments')
        .select('id, patient, phone, patient_id, full_date, check_in_status, time, equipment')
        .ilike('patient', '%donovan%')
        .order('full_date', { ascending: false })
        .limit(20),
      supabase
        .from('patients')
        .select('*')
        .ilike('Name', '%donovan%')
        .limit(20),
    ]);

    if (todayRes.error) throw new Error(todayRes.error.message);

    const patients = (patientsRaw || []).map(mapPatient);
    const appointments = (appointmentsRaw || []).map(mapAppointment);
    const todayRows = (todayRes.data || []).map(mapAppointment);

    const blankAppts = appointments.filter((a) => !usablePatientDisplayName(a.patient));
    const blankCharts = patients.filter((p) => !usablePatientDisplayName(p.patient));
    const todayBlank = todayRows.filter((a) => !usablePatientDisplayName(a.patient));

    const patientById = new Map(patients.map((p) => [String(p.id), p]));
    const todayAppointments = todayRows.map((a) => {
      const chart = a.patient_id != null ? patientById.get(String(a.patient_id)) : null;
      return {
        id: a.id,
        time: a.time,
        equipment: a.equipment,
        patient: a.patient,
        patientLen: String(a.patient ?? '').length,
        patientJson: JSON.stringify(a.patient),
        patient_id: a.patient_id,
        phone: a.phone,
        status: a.check_in_status,
        chartName: chart?.patient || null,
        chartNameLen: chart ? String(chart.patient || '').length : null,
        wouldDisplay: usablePatientDisplayName(chart?.patient) || usablePatientDisplayName(a.patient) || '(blank)',
      };
    });

    let donovanPatients = (donovanPatRes.data || []).map(mapPatient);
    if (donovanPatRes.error) {
      const alt = await supabase.from('patients').select('*').ilike('name', '%donovan%').limit(20);
      donovanPatients = (alt.data || []).map(mapPatient);
    }

    let repair = null;
    if (!dryRun) {
      // Repair across full window + today's blank rows.
      repair = await repairBlankPatientNames(supabase, {
        appointments: [...appointments, ...todayBlank],
        patients,
      });
    }

    return NextResponse.json({
      ok: true,
      today,
      window: { from, to },
      blankAppointments: blankAppts.length,
      blankCharts: blankCharts.length,
      todayBlankCount: todayBlank.length,
      todayBlank: todayBlank.map((a) => ({
        id: a.id,
        time: a.time,
        equipment: a.equipment,
        patient_id: a.patient_id,
        phone: a.phone,
        chartName: patientById.get(String(a.patient_id))?.patient || null,
      })),
      todayAppointments,
      donovanAppointments: donovanApptRes.data || [],
      donovanPatients,
      dryRun,
      repair,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || 'Repair failed' }, { status: 500 });
  }
}
