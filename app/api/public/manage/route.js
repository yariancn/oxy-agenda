import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { verifyAppointmentManageToken } from '../../../../lib/appointmentManageToken.js';
import {
  evaluatePatientSelfManage,
  formatClinicPhoneForPatient,
  publicAppointmentView,
} from '../../../../lib/appointmentManage.js';
import {
  filterRowsByClinic,
  getClinicTimezone,
  normalizeClinicId,
  selectActiveAppointments,
  selectCompanyConfigForClinic,
} from '../../../../lib/clinicRegistry.js';
import { getDayNameFromDate, localeForClinic } from '../../../../lib/i18n.js';
import { updateStaffAppointment } from '../../../../lib/staffAppointmentSave.js';
import { SLOT_UNAVAILABLE } from '../../../../lib/appointmentSlotGuard.js';
import { sendAppointmentNotifyServer } from '../../../../lib/sendAppointmentNotifyServer.js';
import { mergePortalAppointments, readDemoConfig } from '../../../../lib/demoOccupancyServer.js';
import { bumpAgendaLiveRev } from '../../../../lib/agendaLiveRev.js';

function sanitizeCompanyConfig(row) {
  if (!row) return null;
  const {
    master_pin,
    financial_pin,
    demo_occupancy_slots,
    demo_occupancy_overrides,
    ...safe
  } = row;
  return safe;
}

async function loadManageContext(token) {
  const claims = verifyAppointmentManageToken(token);
  if (!claims) {
    return { error: 'invalid_token', status: 401 };
  }

  const clinicName = normalizeClinicId(claims.clinicName);
  const supabase = getSupabaseAdmin(clinicName);

  const { data: appointment, error: apptErr } = await supabase
    .from('appointments')
    .select('id, patient, phone, email, full_date, time, equipment, duration, buffer, check_in_status, clinic, notes, prefers_email, prefers_sms, is_new_patient')
    .eq('id', claims.appointmentId)
    .maybeSingle();

  if (apptErr) return { error: apptErr.message, status: 500 };
  if (!appointment) return { error: 'not_found', status: 404 };

  const apptClinic = normalizeClinicId(appointment.clinic || clinicName);
  if (apptClinic !== clinicName) {
    return { error: 'clinic_mismatch', status: 403 };
  }

  const [resConf, resApp, resBlock, resSrv] = await Promise.all([
    selectCompanyConfigForClinic(supabase, clinicName),
    selectActiveAppointments(supabase),
    supabase.from('blocked_slots').select('*'),
    supabase.from('services').select('*').eq('is_active', true),
  ]);

  if (resConf.error) return { error: resConf.error.message, status: 500 };
  if (resApp.error) return { error: resApp.error.message, status: 500 };
  if (resBlock.error) return { error: resBlock.error.message, status: 500 };
  if (resSrv.error) return { error: resSrv.error.message, status: 500 };

  const rawConfig = resConf.data;
  const companyConfig = sanitizeCompanyConfig(rawConfig) || {
    start_time: '08:00',
    end_time: '20:00',
    interval_mins: 30,
    booking_limit_hours: 2,
    cancel_limit_hours: 24,
  };
  const demo = readDemoConfig(rawConfig);
  const services = filterRowsByClinic(resSrv.data || [], clinicName);
  const realAppointments = filterRowsByClinic(resApp.data || [], clinicName);

  const manage = evaluatePatientSelfManage({
    appointment,
    clinicName,
    cancelLimitHours: companyConfig.cancel_limit_hours,
  });

  return {
    claims,
    clinicName,
    supabase,
    appointment,
    companyConfig,
    manage,
    services,
    appointments: mergePortalAppointments(realAppointments, {
      enabled: demo.enabled,
      demoSlots: demo.slots,
      overrides: demo.overrides,
      services,
    }),
    blockedSlots: filterRowsByClinic(resBlock.data || [], clinicName),
    timezone: getClinicTimezone(clinicName),
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('t') || '';
    const ctx = await loadManageContext(token);
    if (ctx.error) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status || 400 });
    }

    const phone = ctx.companyConfig.phone || '';
    return NextResponse.json({
      appointment: publicAppointmentView(ctx.appointment),
      canManage: ctx.manage.ok === true,
      manage: ctx.manage,
      clinic: {
        id: ctx.clinicName,
        name: ctx.companyConfig.name || ctx.clinicName,
        phone,
        phoneDisplay: formatClinicPhoneForPatient(phone, ctx.clinicName),
        address: ctx.companyConfig.address || '',
      },
      companyConfig: ctx.companyConfig,
      services: ctx.services,
      appointments: ctx.appointments,
      blockedSlots: ctx.blockedSlots,
      timezone: ctx.timezone,
      locale: localeForClinic(ctx.clinicName),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const token = body.t || body.token || '';
    const action = String(body.action || '').trim().toLowerCase();
    if (!['cancel', 'reschedule'].includes(action)) {
      return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
    }

    const ctx = await loadManageContext(token);
    if (ctx.error) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status || 400 });
    }

    if (!ctx.manage.ok) {
      return NextResponse.json({
        error: ctx.manage.reason || 'cannot_manage',
        message: ctx.manage.message,
        manage: ctx.manage,
        clinic: {
          phone: ctx.companyConfig.phone || '',
          phoneDisplay: formatClinicPhoneForPatient(ctx.companyConfig.phone || '', ctx.clinicName),
        },
      }, { status: 403 });
    }

    const locale = localeForClinic(ctx.clinicName);
    const es = locale !== 'en';
    const stamp = new Date().toLocaleString(es ? 'es-MX' : 'en-US');

    if (action === 'cancel') {
      const cancelNote = es
        ? `[PACIENTE ONLINE ${stamp}] Cita cancelada por el paciente.`
        : `[PATIENT ONLINE ${stamp}] Appointment cancelled by the patient.`;
      const newNotes = ctx.appointment.notes
        ? `${ctx.appointment.notes}\n${cancelNote}`
        : cancelNote;

      const { error } = await ctx.supabase
        .from('appointments')
        .update({
          check_in_status: 'Cancelado',
          notes: newNotes,
        })
        .eq('id', ctx.appointment.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await bumpAgendaLiveRev(ctx.supabase, ctx.clinicName).catch(() => null);

      const updated = {
        ...ctx.appointment,
        check_in_status: 'Cancelado',
        notes: newNotes,
      };

      await sendAppointmentNotifyServer({
        appointment: updated,
        companyConfig: ctx.companyConfig,
        clinicName: ctx.clinicName,
        notifyType: 'cancel',
        services: ctx.services,
      }).catch(() => null);

      return NextResponse.json({
        success: true,
        action: 'cancel',
        appointment: publicAppointmentView(updated),
        message: es
          ? 'Tu cita fue cancelada correctamente.'
          : 'Your appointment was cancelled successfully.',
      });
    }

    const selectedDate = String(body.selectedDate || '').trim();
    const selectedTime = String(body.selectedTime || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate) || !selectedTime) {
      return NextResponse.json({ error: 'missing_slot' }, { status: 400 });
    }

    const dayName = getDayNameFromDate(locale, new Date(`${selectedDate}T12:00:00`));
    const moveNote = es
      ? `[PACIENTE ONLINE ${stamp}] Reprogramada de ${ctx.appointment.full_date} ${ctx.appointment.time} a ${selectedDate} ${selectedTime}.`
      : `[PATIENT ONLINE ${stamp}] Rescheduled from ${ctx.appointment.full_date} ${ctx.appointment.time} to ${selectedDate} ${selectedTime}.`;
    const newNotes = ctx.appointment.notes
      ? `${ctx.appointment.notes}\n${moveNote}`
      : moveNote;

    const { data, error } = await updateStaffAppointment(ctx.supabase, ctx.appointment.id, {
      full_date: selectedDate,
      appointment_date: selectedDate,
      day: dayName,
      time: selectedTime,
      appointment_time: selectedTime,
      equipment: ctx.appointment.equipment,
      duration: ctx.appointment.duration || 60,
      buffer: ctx.appointment.buffer || 0,
      notes: newNotes,
      clinic: ctx.clinicName,
    });

    if (error) {
      if (error.message === SLOT_UNAVAILABLE) {
        return NextResponse.json({
          error: 'SLOT_UNAVAILABLE',
          message: es
            ? 'Ese horario ya no está disponible. Elige otro.'
            : 'That time is no longer available. Please choose another.',
        }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await bumpAgendaLiveRev(ctx.supabase, ctx.clinicName).catch(() => null);

    const updated = Array.isArray(data) ? data[0] : (data || {
      ...ctx.appointment,
      full_date: selectedDate,
      time: selectedTime,
      notes: newNotes,
    });

    // Re-check 24h rule is not needed for the new slot for the action itself;
    // send reschedule confirmation with a fresh manage link.
    await sendAppointmentNotifyServer({
      appointment: updated,
      companyConfig: ctx.companyConfig,
      clinicName: ctx.clinicName,
      notifyType: 'reschedule',
      services: ctx.services,
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      action: 'reschedule',
      appointment: publicAppointmentView(updated),
      message: es
        ? 'Tu cita fue reprogramada correctamente. Te enviamos la nueva confirmación por correo.'
        : 'Your appointment was rescheduled. We sent the new confirmation by email.',
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
