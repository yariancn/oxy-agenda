import { NextResponse } from 'next/server';
import { authorizeCron } from '../../../../lib/cronAuth.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import {
  CLINIC_OXYGENDGL,
  CLINIC_SHENANDOAH,
  normalizeClinicId,
} from '../../../../lib/clinicRegistry.js';
import { liveSyncDateRange } from '../../../../lib/liveSyncToken.js';
import {
  repairBlankPatientNames,
  usablePatientDisplayName,
  withCanonicalPatientName,
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

function resolveClinic(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v || v === 'gdl' || v === 'oxygengdl' || v === 'mx') return CLINIC_OXYGENDGL;
  if (v === 'tx' || v === 'houston' || v === 'shenandoah' || v.includes('shenandoah')) {
    return CLINIC_SHENANDOAH;
  }
  return normalizeClinicId(raw) || CLINIC_OXYGENDGL;
}

/**
 * Heal blank appointment/chart names.
 * GET ?clinic=Shenandoah|Oxygengdl&dryRun=1
 */
export async function GET(request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dryRun') === '1';
  const clinic = resolveClinic(searchParams.get('clinic') || 'Shenandoah');
  const both = searchParams.get('both') === '1';

  try {
    const clinics = both ? [CLINIC_OXYGENDGL, CLINIC_SHENANDOAH] : [clinic];
    const results = [];

    for (const clinicId of clinics) {
      const supabase = getSupabaseAdmin(clinicId);
      const { from, to } = liveSyncDateRange(clinicId);
      const today = new Date().toLocaleDateString('en-CA', {
        timeZone: clinicId === CLINIC_SHENANDOAH ? 'America/Chicago' : 'America/Mexico_City',
      });

      const [patientsRaw, appointmentsRaw, todayRes, donovanApptRes, donovanPatRes] = await Promise.all([
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
        (async () => {
          let res = await supabase.from('patients').select('*').ilike('Name', '%donovan%').limit(20);
          if (res.error) res = await supabase.from('patients').select('*').ilike('name', '%donovan%').limit(20);
          return res;
        })(),
      ]);

      if (todayRes.error) throw new Error(`${clinicId} today: ${todayRes.error.message}`);

      const patients = (patientsRaw || []).map(mapPatient);
      const appointments = (appointmentsRaw || []).map(mapAppointment);
      const todayRows = (todayRes.data || []).map(mapAppointment);
      const patientById = new Map(patients.map((p) => [String(p.id), p]));

      const blankAppts = appointments.filter((a) => !usablePatientDisplayName(a.patient));
      const blankCharts = patients.filter((p) => !usablePatientDisplayName(p.patient));
      const todayBlank = todayRows.filter((a) => !usablePatientDisplayName(a.patient));

      // What the calendar WOULD show after withCanonicalPatientName (catches empty chart overwrite)
      const todayDisplay = todayRows.map((a) => {
        const shown = withCanonicalPatientName(a, patients);
        const display = usablePatientDisplayName(shown.patient)
          || usablePatientDisplayName(a.phone)
          || '(blank)';
        return {
          id: a.id,
          time: a.time,
          equipment: a.equipment,
          rawPatient: a.patient,
          display,
          patient_id: a.patient_id,
          chartName: patientById.get(String(a.patient_id))?.patient || null,
          status: a.check_in_status,
        };
      });

      const wouldShowBlank = todayDisplay.filter((a) => a.display === '(blank)' || !usablePatientDisplayName(a.display));

      let donovanPatients = (donovanPatRes.data || []).map(mapPatient);
      const donovanAppts = donovanApptRes.data || [];

      // Also find donovan by chart link even if appointment.patient blank
      const donovanLinked = todayRows.filter((a) => {
        const chart = patientById.get(String(a.patient_id));
        return chart && /donovan/i.test(chart.patient);
      });

      let repair = null;
      if (!dryRun) {
        repair = await repairBlankPatientNames(supabase, {
          appointments: [...appointments, ...todayBlank, ...donovanAppts.map(mapAppointment)],
          patients,
        });
        // Force-fill Patricia Donovan style blanks from chart when appointment.patient empty
        for (const app of [...todayBlank, ...donovanLinked]) {
          const chart = patientById.get(String(app.patient_id));
          const chartName = usablePatientDisplayName(chart?.patient);
          if (!chartName || usablePatientDisplayName(app.patient)) continue;
          const { error } = await supabase.from('appointments').update({ patient: chartName }).eq('id', app.id);
          if (!error) {
            repair = repair || { appointmentsFixed: 0, chartsFixed: 0 };
            repair.appointmentsFixed = (repair.appointmentsFixed || 0) + 1;
            app.patient = chartName;
          }
        }
      }

      results.push({
        clinic: clinicId,
        today,
        window: { from, to },
        blankAppointments: blankAppts.length,
        blankCharts: blankCharts.length,
        todayBlankCount: todayBlank.length,
        todayWouldShowBlank: wouldShowBlank,
        todayAppointments: todayDisplay,
        donovanAppointments: donovanAppts,
        donovanPatients,
        donovanLinkedToday: donovanLinked.map((a) => ({
          id: a.id,
          time: a.time,
          patient: a.patient,
          chartName: patientById.get(String(a.patient_id))?.patient,
        })),
        dryRun,
        repair,
      });
    }

    return NextResponse.json({
      ok: true,
      results: both ? results : results[0],
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || 'Repair failed' }, { status: 500 });
  }
}
