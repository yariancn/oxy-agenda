#!/usr/bin/env node

/**
 * Carga datos DEMO en Guadalajara: pacientes recurrentes con paquetes,
 * citas diarias sin empalmes (~50% de capacidad), semana actual y/o próxima.
 *
 * Uso:
 *   npm run seed-demo:gdl              # semana actual
 *   npm run seed-demo:gdl:next         # próxima semana
 *   npm run seed-demo:gdl:both         # ambas semanas
 *   npm run seed-demo:gdl:clear        # borrar todo DEMO
 */

import { supabaseGdl } from '../lib/supabase.js';
import { SESSION_PRESETS } from '../lib/sessionPresets.js';

const DEMO_PREFIX = '[DEMO]';
const DEMO_NOTE = 'seed-demo-gdl';
const TZ = 'America/Mexico_City';
const DURATION = SESSION_PRESETS.standard.duration;
const BUFFER = SESSION_PRESETS.standard.buffer;
const BLOCK_MINS = DURATION + BUFFER;

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const clearOnly = args.has('--clear');
const fillArg = process.argv.find((a) => a.startsWith('--fill='));
const FILL_RATIO = fillArg ? Number(fillArg.split('=')[1]) : 0.5;

const weekArg = process.argv.find((a) => a.startsWith('--week='));
const WEEK_MODE = (() => {
  if (args.has('--both')) return 'both';
  if (!weekArg) return 'current';
  const val = weekArg.split('=')[1];
  if (val === 'next') return 'next';
  if (val === 'both') return 'both';
  return 'current';
})();

/** 12 pacientes recurrentes: 4 por cámara, horarios cada 90 min (sin empalmes) */
const RECURRING_PATIENTS = [
  { name: 'Ana Martínez', phone: '+52 3312345001', protocol: 'Wellness', serviceIdx: 0, startMins: 7 * 60 },
  { name: 'Carlos Ruiz', phone: '+52 3312345002', protocol: 'Médico', serviceIdx: 0, startMins: 8 * 60 + 30 },
  { name: 'María López', phone: '+52 3312345003', protocol: 'Wellness', serviceIdx: 0, startMins: 10 * 60 },
  { name: 'Jorge Hernández', phone: '+52 3312345004', protocol: 'Wellness', serviceIdx: 0, startMins: 11 * 60 + 30 },
  { name: 'Laura Sánchez', phone: '+52 3312345005', protocol: 'Médico', serviceIdx: 1, startMins: 7 * 60 },
  { name: 'Pedro Gómez', phone: '+52 3312345006', protocol: 'Wellness', serviceIdx: 1, startMins: 8 * 60 + 30 },
  { name: 'Sofía Ramírez', phone: '+52 3312345007', protocol: 'Wellness', serviceIdx: 1, startMins: 10 * 60 },
  { name: 'Diego Torres', phone: '+52 3312345008', protocol: 'Médico', serviceIdx: 1, startMins: 11 * 60 + 30 },
  { name: 'Elena Vázquez', phone: '+52 3312345009', protocol: 'Wellness', serviceIdx: 2, startMins: 7 * 60 },
  { name: 'Miguel Castro', phone: '+52 3312345010', protocol: 'Wellness', serviceIdx: 2, startMins: 8 * 60 + 30 },
  { name: 'Patricia Morales', phone: '+52 3312345011', protocol: 'Médico', serviceIdx: 2, startMins: 10 * 60 },
  { name: 'Roberto Flores', phone: '+52 3312345012', protocol: 'Wellness', serviceIdx: 2, startMins: 11 * 60 + 30 },
];

const PACKAGE_SESSIONS = 30;

function getMinutes(t) {
  if (!t) return 0;
  const cleanT = String(t).trim();
  const isPM = cleanT.toUpperCase().includes('PM');
  const isAM = cleanT.toUpperCase().includes('AM');
  let [h, m] = cleanT.replace(/AM|PM/gi, '').trim().split(':').map(Number);
  if (Number.isNaN(h)) h = 0;
  if (Number.isNaN(m)) m = 0;
  if (isPM && h !== 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h * 60 + m;
}

function formatTime(m) {
  const h = Math.floor(m / 60);
  const mins = m % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const dispH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${dispH.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} ${ampm}`;
}

function mexicoNow() {
  const local = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  return {
    dateStr: `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`,
    mins: local.getHours() * 60 + local.getMinutes(),
  };
}

function getWeekDates(weekOffset = 0) {
  const { dateStr } = mexicoNow();
  const [y, mo, d] = dateStr.split('-').map(Number);
  const anchor = new Date(y, mo - 1, d);
  const day = anchor.getDay();
  const diff = anchor.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(anchor);
  monday.setDate(diff + weekOffset * 7);

  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    const fullDate = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    return { fullDate, day: dayNames[dt.getDay()] };
  });
}

function resolveStatus(fullDate, timeStr, now, patientIdx, dayIdx) {
  if (fullDate < now.dateStr) {
    if (dayIdx === 2 && patientIdx === 0) return 'No Asistió';
    if (dayIdx === 4 && patientIdx === 1) return 'Falta Justificada';
    return 'Finalizado';
  }
  if (fullDate > now.dateStr) return 'Agendado';
  const slotMins = getMinutes(timeStr);
  if (slotMins + BLOCK_MINS <= now.mins) return 'Finalizado';
  if (slotMins <= now.mins) {
    return patientIdx % 3 === 0 ? 'En Sesión' : 'Llegó';
  }
  return 'Agendado';
}

function buildPackageHistory(serviceName, equipment, price) {
  return [{
    id: Date.now() + Math.floor(Math.random() * 10000),
    date: new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    serviceName,
    equipment: equipment || serviceName,
    sessions: PACKAGE_SESSIONS,
    price,
    paymentMethod: 'Tarjeta de Crédito',
    operator: 'Seed DEMO',
  }];
}

function countConsumed(status) {
  return status === 'Finalizado' || status === 'No Asistió' ? 1 : 0;
}

function overlaps(a, b) {
  if (a.equipment !== b.equipment || a.full_date !== b.full_date) return false;
  const s1 = getMinutes(a.time);
  const e1 = s1 + BLOCK_MINS;
  const s2 = getMinutes(b.time);
  const e2 = s2 + BLOCK_MINS;
  return s1 < e2 && e1 > s2;
}

async function clearDemoData() {
  const { data: demoApps, error: appErr } = await supabaseGdl
    .from('appointments')
    .select('id, patient, notes')
    .or(`patient.ilike.${DEMO_PREFIX}%,notes.ilike.%${DEMO_NOTE}%`);
  if (appErr) throw appErr;

  const { data: demoPatients, error: patErr } = await supabaseGdl
    .from('patients')
    .select('id, Name')
    .ilike('Name', `${DEMO_PREFIX}%`);
  if (patErr) throw patErr;

  const appIds = (demoApps || []).map((r) => r.id);
  const patIds = (demoPatients || []).map((r) => r.id);

  if (dryRun) {
    console.log(`[dry-run] Se borrarían ${appIds.length} citas y ${patIds.length} pacientes DEMO.`);
    return { apps: appIds.length, patients: patIds.length };
  }

  if (appIds.length > 0) {
    const { error } = await supabaseGdl.from('appointments').delete().in('id', appIds);
    if (error) throw error;
  }
  if (patIds.length > 0) {
    const { error } = await supabaseGdl.from('patients').delete().in('id', patIds);
    if (error) throw error;
  }

  console.log(`✓ Eliminadas ${appIds.length} citas y ${patIds.length} pacientes DEMO.`);
  return { apps: appIds.length, patients: patIds.length };
}

async function seedWeek(weekOffset, services, config, existingApps, blocked) {
  const week = getWeekDates(weekOffset);
  const now = mexicoNow();
  const startMins = getMinutes(config.start_time || '07:00');
  const endMins = getMinutes(config.end_time || '20:00');

  const appointments = [];
  const patientStats = RECURRING_PATIENTS.map(() => ({ completed: 0, total: 0 }));

  for (let pi = 0; pi < RECURRING_PATIENTS.length; pi += 1) {
    const p = RECURRING_PATIENTS[pi];
    const srv = services[p.serviceIdx];
    if (!srv) continue;
    const equipment = srv.name;
    const time = formatTime(p.startMins);

    if (p.startMins + BLOCK_MINS > endMins || p.startMins < startMins) continue;

    for (let di = 0; di < week.length; di += 1) {
      const w = week[di];
      const status = resolveStatus(w.fullDate, time, now, pi, di);
      const row = {
        patient: `${DEMO_PREFIX} ${p.name}`,
        phone: p.phone,
        protocol: p.protocol,
        equipment,
        duration: DURATION,
        buffer: BUFFER,
        full_date: w.fullDate,
        appointment_date: w.fullDate,
        day: w.day,
        time,
        appointment_time: time,
        attendant: status === 'Finalizado' ? 'Dr. Demo' : 'Por Asignar',
        check_in_status: status,
        is_new_patient: false,
        notes: `${DEMO_NOTE} — paciente recurrente, sesión diaria`,
      };

      const clashExisting = [...existingApps, ...appointments].some((a) => {
        if (a.check_in_status === 'Cancelado') return false;
        return overlaps(a, row);
      });
      const clashBlocked = blocked.some((b) => {
        if (b.date !== w.fullDate) return false;
        if (!b.is_global && b.equipment !== equipment) return false;
        const bStart = getMinutes(b.start_time);
        const bEnd = getMinutes(b.end_time);
        const s1 = p.startMins;
        const e1 = s1 + BLOCK_MINS;
        return (s1 >= bStart && s1 < bEnd) || (e1 > bStart && e1 <= bEnd) || (s1 <= bStart && e1 >= bEnd);
      });

      if (!clashExisting && !clashBlocked) {
        appointments.push(row);
        patientStats[pi].total += 1;
        patientStats[pi].completed += countConsumed(status);
      }
    }
  }

  return { week, appointments, patientStats };
}

async function main() {
  if (clearOnly) {
    await clearDemoData();
    return;
  }

  const weekOffsets = WEEK_MODE === 'both' ? [0, 1] : WEEK_MODE === 'next' ? [1] : [0];

  const [srvRes, cfgRes, appRes, blockRes] = await Promise.all([
    supabaseGdl.from('services').select('*').eq('is_active', true).order('name'),
    supabaseGdl.from('company_config').select('*').eq('clinic', 'Guadalajara').maybeSingle(),
    supabaseGdl.from('appointments').select('equipment, full_date, time, duration, buffer, check_in_status, patient'),
    supabaseGdl.from('blocked_slots').select('*'),
  ]);

  if (srvRes.error) throw srvRes.error;
  if (cfgRes.error) throw cfgRes.error;
  if (appRes.error) throw appRes.error;
  if (blockRes.error) throw blockRes.error;

  const services = (srvRes.data || []).sort((a, b) => a.name.localeCompare(b.name));
  const config = {
    start_time: '07:00',
    end_time: '20:00',
    interval_mins: 30,
    ...cfgRes.data,
  };
  const existingApps = (appRes.data || []).filter((a) => !String(a.patient || '').startsWith(DEMO_PREFIX));
  const blocked = blockRes.data || [];

  if (services.length === 0) {
    console.error('✗ No hay servicios activos en GDL.');
    process.exit(1);
  }

  console.log('\n=== Seed DEMO — Guadalajara (recurrentes) ===');
  console.log(`Modo: ${WEEK_MODE} | Objetivo ~${Math.round(FILL_RATIO * 100)}% por semana`);

  if (!dryRun) {
    await clearDemoData();
  } else {
    console.log('[dry-run] Se limpiarían datos DEMO previos antes de insertar.');
  }

  let allAppointments = [];
  const aggregateStats = RECURRING_PATIENTS.map(() => ({ completed: 0, total: 0 }));

  for (const offset of weekOffsets) {
    const { week, appointments, patientStats } = await seedWeek(offset, services, config, [...existingApps, ...allAppointments], blocked);
    const label = offset === 0 ? 'actual' : offset === 1 ? 'próxima' : `+${offset}`;
    const maxSlots = services.length * 8 * 7;
    console.log(`\nSemana ${label}: ${week[0].fullDate} → ${week[6].fullDate}`);
    console.log(`  Citas a insertar: ${appointments.length} (~${Math.round((appointments.length / maxSlots) * 100)}% de ${maxSlots} espacios)`);

    allAppointments.push(...appointments);
    patientStats.forEach((s, i) => {
      aggregateStats[i].completed += s.completed;
      aggregateStats[i].total += s.total;
    });
  }

  let overlapCount = 0;
  for (let i = 0; i < allAppointments.length; i += 1) {
    for (let j = i + 1; j < allAppointments.length; j += 1) {
      if (overlaps(allAppointments[i], allAppointments[j])) overlapCount += 1;
    }
  }
  if (overlapCount > 0) {
    console.error(`✗ Validación fallida: ${overlapCount} empalmes detectados. Abortando.`);
    process.exit(1);
  }
  console.log(`✓ Validación: 0 empalmes en ${allAppointments.length} citas.`);

  const patientRows = RECURRING_PATIENTS.map((p, i) => {
    const srv = services[p.serviceIdx];
    const walletKey = srv.equipment || srv.name;
    const completed = aggregateStats[i].completed;
    const remaining = PACKAGE_SESSIONS - completed;

    return {
      Name: `${DEMO_PREFIX} ${p.name}`,
      Phone: p.phone,
      Email: `${p.name.split(' ')[0].toLowerCase()}.demo@oxy.test`,
      protocol: p.protocol,
      notes: `${DEMO_NOTE} — paciente recurrente con paquete de ${PACKAGE_SESSIONS} sesiones`,
      wallets: { [walletKey]: remaining },
      historico_sesiones: completed,
      package_history: buildPackageHistory(srv.name, walletKey, srv.price || 750),
      prefers_email: true,
      prefers_sms: true,
      is_blocked: false,
    };
  });

  if (dryRun) {
    console.log('\n[dry-run] Pacientes:');
    patientRows.slice(0, 3).forEach((p) => {
      const w = Object.entries(p.wallets)[0];
      console.log(`  • ${p.Name} | tomadas: ${p.historico_sesiones} | pendientes: ${w[1]} (${w[0]})`);
    });
    console.log('\n[dry-run] Primeras 5 citas:');
    allAppointments.slice(0, 5).forEach((r) => {
      console.log(`  • ${r.full_date} ${r.time} | ${r.equipment} | ${r.patient} | ${r.check_in_status}`);
    });
    console.log(`\n[dry-run] Total: ${patientRows.length} pacientes, ${allAppointments.length} citas`);
    return;
  }

  const { data: insertedPatients, error: patInsertErr } = await supabaseGdl
    .from('patients')
    .insert(patientRows)
    .select('id, Name');
  if (patInsertErr) throw patInsertErr;

  const BATCH = 50;
  let insertedApps = 0;
  for (let i = 0; i < allAppointments.length; i += BATCH) {
    const batch = allAppointments.slice(i, i + BATCH);
    const { error } = await supabaseGdl.from('appointments').insert(batch);
    if (error) throw error;
    insertedApps += batch.length;
  }

  console.log(`\n✓ Insertados ${insertedPatients.length} pacientes y ${insertedApps} citas DEMO.`);
  console.log('\nResumen por paciente:');
  patientRows.forEach((p) => {
    const [eq, pending] = Object.entries(p.wallets)[0];
    const paid = PACKAGE_SESSIONS;
    console.log(`  • ${p.Name}`);
    console.log(`      Pagadas: ${paid} | Tomadas: ${p.historico_sesiones} | Pendientes: ${pending} (${eq})`);
  });
  console.log('\n  Para eliminar: npm run seed-demo:gdl:clear');
}

main().catch((err) => {
  console.error('✗ Error:', err.message || err);
  process.exit(1);
});
