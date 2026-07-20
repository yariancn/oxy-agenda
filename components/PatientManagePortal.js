'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { buildDaySlots, countAvailableSlots } from '../lib/publicBookingSlots';
import { isClinicOpenOnDate } from '../lib/clinicWeeklySchedule';
import { PUBLIC_SLOT_STATUS } from '../lib/i18n';
import { getClinicTimezone, isShenandoah } from '../lib/clinicRegistry';

const COPY = {
  es: {
    title: 'Gestionar mi cita',
    loading: 'Cargando…',
    invalid: 'Este enlace no es válido o ya expiró. Si necesitas ayuda, llámanos a la clínica.',
    yourAppt: 'Tu cita',
    date: 'Fecha',
    time: 'Hora',
    service: 'Servicio',
    status: 'Estado',
    cancel: 'Cancelar cita',
    reschedule: 'Reprogramar',
    confirmCancel: '¿Enviar solicitud de cancelación? La clínica debe aprobarla antes de liberar el horario.',
    confirming: 'Procesando…',
    pickDate: 'Elige una nueva fecha',
    pickTime: 'Elige un horario',
    noSlots: 'No hay horarios disponibles este día.',
    back: 'Volver',
    submitReschedule: 'Confirmar nueva hora',
    lockedTitle: 'No disponible en línea',
    callUs: 'Llámanos',
    doneCancel: 'Solicitud enviada',
    doneReschedule: 'Cita reprogramada',
    closedHint: 'Esta cita ya no se puede modificar en línea.',
    pendingHint: 'Tu solicitud quedó pendiente de confirmación de la clínica.',
  },
  en: {
    title: 'Manage my appointment',
    loading: 'Loading…',
    invalid: 'This link is invalid or has expired. If you need help, please call the clinic.',
    yourAppt: 'Your appointment',
    date: 'Date',
    time: 'Time',
    service: 'Service',
    status: 'Status',
    cancel: 'Cancel appointment',
    reschedule: 'Reschedule',
    confirmCancel: 'Send a cancellation request? The clinic must approve before the slot is freed.',
    confirming: 'Working…',
    pickDate: 'Choose a new date',
    pickTime: 'Choose a time',
    noSlots: 'No times available on this day.',
    back: 'Back',
    submitReschedule: 'Confirm new time',
    lockedTitle: 'Not available online',
    callUs: 'Call us',
    doneCancel: 'Request sent',
    doneReschedule: 'Appointment rescheduled',
    closedHint: 'This appointment can no longer be changed online.',
    pendingHint: 'Your request is pending clinic confirmation.',
  },
};

function formatDateLabel(iso, locale) {
  if (!iso) return '—';
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function telHref(phone, clinicId) {
  const digits = String(phone || '').replace(/\D/g, '');
  const last10 = digits.slice(-10);
  if (last10.length !== 10) return '';
  return isShenandoah(clinicId) ? `tel:+1${last10}` : `tel:+52${last10}`;
}

export default function PatientManagePortal() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);
  const [mode, setMode] = useState('view'); // view | reschedule | done
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [doneMessage, setDoneMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('t') || '';
    setToken(t);
    if (!t) {
      setError('invalid_token');
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/manage?t=${encodeURIComponent(t)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) {
            setError(data.error || 'invalid_token');
            setLoading(false);
          }
          return;
        }
        if (!cancelled) {
          setPayload(data);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'invalid_token');
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const locale = payload?.locale === 'en' ? 'en' : 'es';
  const t = COPY[locale];
  const appointment = payload?.appointment;
  const clinic = payload?.clinic;
  const canManage = payload?.canManage === true;
  const timezone = payload?.timezone || getClinicTimezone(clinic?.id);

  useEffect(() => {
    document.documentElement.lang = locale === 'en' ? 'en' : 'es';
  }, [locale]);

  const matchingService = useMemo(() => {
    if (!appointment?.equipment || !payload?.services) return null;
    return (payload.services || []).find((s) => s.name === appointment.equipment) || {
      name: appointment.equipment,
      duration: appointment.duration,
      buffer: appointment.buffer,
    };
  }, [appointment, payload?.services]);

  const daySlots = useMemo(() => {
    if (!selectedDate || !appointment || !payload?.companyConfig) return [];
    return buildDaySlots({
      dbConfig: payload.companyConfig,
      selectedDate,
      equipmentName: appointment.equipment,
      service: matchingService,
      dbAppointments: payload.appointments || [],
      dbBlockedSlots: payload.blockedSlots || [],
      timezone,
      duration: Number(appointment.duration) || 60,
      buffer: Number(appointment.buffer) || 0,
      excludeAppointmentId: appointment.id,
    });
  }, [selectedDate, appointment, payload, matchingService, timezone]);

  const availableCount = countAvailableSlots(daySlots);
  const phoneDisplay = clinic?.phoneDisplay || clinic?.phone || '';
  const phoneTel = telHref(clinic?.phone || phoneDisplay, clinic?.id);

  const minDate = useMemo(() => {
    const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
    return `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;
  }, [timezone]);

  const runAction = async (action, extra = {}) => {
    setBusy(true);
    try {
      const res = await fetch('/api/public/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: token, action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.manage?.reason === 'too_soon' || data.error === 'too_soon') {
          setPayload((prev) => (prev ? {
            ...prev,
            canManage: false,
            manage: data.manage || prev.manage,
          } : prev));
          setMode('view');
        }
        alert(data.message || data.error || t.invalid);
        return;
      }
      setDoneMessage(data.message || (action === 'cancel' ? t.doneCancel : t.doneReschedule));
      if (data.appointment) {
        setPayload((prev) => (prev ? { ...prev, appointment: data.appointment, canManage: false } : prev));
      }
      setMode('done');
    } catch (e) {
      alert(e.message || t.invalid);
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async () => {
    if (!window.confirm(t.confirmCancel)) return;
    await runAction('cancel');
  };

  const onReschedule = async () => {
    if (!selectedDate || !selectedTime) return;
    await runAction('reschedule', { selectedDate, selectedTime });
  };

  const slotStatusLabel = (status) => {
    const map = PUBLIC_SLOT_STATUS[locale] || PUBLIC_SLOT_STATUS.es;
    return map[status] || status;
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col">
      <header className="bg-slate-900 text-white p-4 shadow-lg">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <img
            src="/1c3300f3-f5e7-4682-b627-257e868ed467.jpg"
            className="h-10 w-auto bg-white rounded p-1 shrink-0"
            alt=""
          />
          <div className="min-w-0">
            <h1 className="text-sm font-black uppercase tracking-widest truncate">
              {clinic?.name || 'Oxygen'}
            </h1>
            <p className="text-[10px] font-bold uppercase text-slate-300">{t.title}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8 flex justify-center">
        <div className="max-w-xl w-full bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="p-6 md:p-8 space-y-5">
            {loading && (
              <p className="text-center text-sm font-bold text-slate-400 uppercase py-10">{t.loading}</p>
            )}

            {!loading && (error || !appointment) && (
              <div className="text-center space-y-3 py-6">
                <p className="text-sm font-bold text-slate-700 leading-relaxed">{t.invalid}</p>
              </div>
            )}

            {!loading && appointment && mode === 'done' && (
              <div className="text-center space-y-3 py-4">
                <p className="text-lg font-black text-emerald-700 uppercase">{doneMessage}</p>
                {appointment.check_in_status === 'Pendiente cancelación' && (
                  <p className="text-sm text-amber-800 font-bold leading-relaxed">{t.pendingHint}</p>
                )}
                {appointment.check_in_status !== 'Cancelado' && (
                  <div className="text-left rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-1 text-sm">
                    <p><span className="font-bold">{t.date}:</span> {formatDateLabel(appointment.full_date, locale)}</p>
                    <p><span className="font-bold">{t.time}:</span> {appointment.time}</p>
                    <p><span className="font-bold">{t.service}:</span> {appointment.equipment}</p>
                  </div>
                )}
              </div>
            )}

            {!loading && appointment && mode !== 'done' && (
              <>
                <div>
                  <h2 className="text-xl font-black uppercase text-slate-800 mb-3">{t.yourAppt}</h2>
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-1 text-sm">
                    <p className="font-black text-slate-900">{appointment.patient}</p>
                    <p><span className="font-bold">{t.date}:</span> {formatDateLabel(appointment.full_date, locale)}</p>
                    <p><span className="font-bold">{t.time}:</span> {appointment.time}</p>
                    <p><span className="font-bold">{t.service}:</span> {appointment.equipment}</p>
                    <p><span className="font-bold">{t.status}:</span> {appointment.check_in_status}</p>
                  </div>
                </div>

                {!canManage && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                    <p className="text-sm font-black uppercase text-amber-900">{t.lockedTitle}</p>
                    <p className="text-sm text-amber-950 leading-relaxed">
                      {payload?.manage?.message || t.closedHint}
                    </p>
                    {phoneDisplay && (
                      <div className="pt-1">
                        <p className="text-xs font-bold uppercase text-amber-800 mb-1">{t.callUs}</p>
                        {phoneTel ? (
                          <a href={phoneTel} className="text-lg font-black text-amber-950 hover:underline">
                            {phoneDisplay}
                          </a>
                        ) : (
                          <p className="text-lg font-black text-amber-950">{phoneDisplay}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {canManage && mode === 'view' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setSelectedDate('');
                        setSelectedTime('');
                        setMode('reschedule');
                      }}
                      className="w-full py-3 rounded-xl bg-emerald-600 text-white font-black uppercase text-xs tracking-wide hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {t.reschedule}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={onCancel}
                      className="w-full py-3 rounded-xl bg-white border-2 border-red-200 text-red-700 font-black uppercase text-xs tracking-wide hover:bg-red-50 disabled:opacity-50"
                    >
                      {busy ? t.confirming : t.cancel}
                    </button>
                  </div>
                )}

                {canManage && mode === 'reschedule' && (
                  <div className="space-y-4">
                    <button
                      type="button"
                      onClick={() => setMode('view')}
                      className="text-xs font-black uppercase text-slate-500 hover:text-slate-800"
                    >
                      ← {t.back}
                    </button>

                    <label className="block space-y-1">
                      <span className="text-xs font-black uppercase text-slate-500">{t.pickDate}</span>
                      <input
                        type="date"
                        min={minDate}
                        value={selectedDate}
                        onChange={(e) => {
                          setSelectedDate(e.target.value);
                          setSelectedTime('');
                        }}
                        className="w-full p-3 border border-slate-200 rounded-xl font-bold outline-none focus:border-emerald-500"
                      />
                    </label>

                    {selectedDate && !isClinicOpenOnDate(payload.companyConfig, selectedDate) && (
                      <p className="text-sm font-bold text-slate-500">{t.noSlots}</p>
                    )}

                    {selectedDate && isClinicOpenOnDate(payload.companyConfig, selectedDate) && (
                      <div className="space-y-2">
                        <p className="text-xs font-black uppercase text-slate-500">{t.pickTime}</p>
                        {availableCount === 0 ? (
                          <p className="text-sm font-bold text-slate-500">{t.noSlots}</p>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {daySlots.filter((s) => s.status === 'available').map((slot) => (
                              <button
                                key={slot.time}
                                type="button"
                                onClick={() => setSelectedTime(slot.time)}
                                className={`py-2.5 px-2 rounded-xl text-xs font-black border ${
                                  selectedTime === slot.time
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-white text-slate-800 border-slate-200 hover:border-emerald-400'
                                }`}
                              >
                                {slot.time}
                              </button>
                            ))}
                          </div>
                        )}
                        {daySlots.some((s) => s.status !== 'available') && (
                          <p className="text-[10px] text-slate-400 font-bold">
                            {daySlots
                              .filter((s) => s.status !== 'available')
                              .slice(0, 3)
                              .map((s) => `${s.time}: ${slotStatusLabel(s.status)}`)
                              .join(' · ')}
                          </p>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={busy || !selectedDate || !selectedTime}
                      onClick={onReschedule}
                      className="w-full py-3 rounded-xl bg-emerald-600 text-white font-black uppercase text-xs tracking-wide hover:bg-emerald-700 disabled:opacity-40"
                    >
                      {busy ? t.confirming : t.submitReschedule}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
