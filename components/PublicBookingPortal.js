'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { buildDaySlots, countAvailableSlots } from '../lib/publicBookingSlots';
import { PUBLIC_SESSION } from '../lib/sessionPresets';
import { PUBLIC_BOOKING_COPY, PUBLIC_SLOT_STATUS } from '../lib/i18n';
import {
  getPromoFromUrl,
  normalizePromoCode,
  resolvePromoter,
} from '../lib/promoters';
import {
  notifyHadFailure,
  sendAppointmentNotification,
  summarizeNotifyReport,
} from '../lib/appointmentNotify';
import { resolveAppointmentNotifyType } from '../lib/emailTemplates';
import {
  getSessionInstructionsLabel,
  isAutoNotifyEnabled,
  resolveSessionInstructions,
} from '../lib/notifySettings';
import { notifyStaffNewBooking } from '../lib/staffBookingAlert';

export default function PublicBookingPortal({
  clinicName,
  portalTag,
  locale = 'es',
  branding,
}) {
  const t = PUBLIC_BOOKING_COPY[locale] || PUBLIC_BOOKING_COPY.es;

  useEffect(() => {
    document.documentElement.lang = locale === 'en' ? 'en' : 'es';
  }, [locale]);
  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    lada: branding.defaultLada,
    notes: '',
    promoterCode: '',
  });
  const [promoterList, setPromoterList] = useState([]);
  const [promoFromLink, setPromoFromLink] = useState(false);
  const [dbServices, setDbServices] = useState([]);
  const [dbAppointments, setDbAppointments] = useState([]);
  const [dbBlockedSlots, setDbBlockedSlots] = useState([]);
  const [dbConfig, setDbConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activePromoter = useMemo(
    () => resolvePromoter(formData.promoterCode, promoterList),
    [formData.promoterCode, promoterList],
  );

  const accentRing = branding.accent === 'emerald' ? 'ring-emerald-500' : 'ring-blue-500';
  const accentBorder = branding.accent === 'emerald' ? 'border-emerald-500' : 'border-blue-500';
  const accentBg = branding.accent === 'emerald' ? 'bg-emerald-600' : 'bg-blue-600';
  const accentText = branding.accent === 'emerald' ? 'text-emerald-400' : 'text-blue-400';

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/public/portal?clinic=${encodeURIComponent(clinicName)}`);
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Load failed');

        setDbServices((payload.services || []).sort((a, b) => a.name.length - b.name.length));
        setDbAppointments(payload.appointments || []);
        setDbBlockedSlots(payload.blockedSlots || []);
        setDbConfig(payload.companyConfig || {
          start_time: '08:00',
          end_time: '20:00',
          interval_mins: 30,
          booking_limit_hours: 2,
        });
        const promoters = (payload.promoters || []).map((row) => ({
          code: normalizePromoCode(row.code),
          name: String(row.name || '').trim(),
        }));
        setPromoterList(promoters);
        const promo = getPromoFromUrl();
        if (promo) {
          setPromoFromLink(true);
          setFormData((prev) => ({ ...prev, promoterCode: promo }));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [clinicName]);

  const dateOptions = useMemo(() => {
    const dates = [];
    const start = new Date(
      new Date().toLocaleString('en-US', { timeZone: branding.timezone }),
    );
    for (let i = 0; i < 14; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const fullDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const label = d.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-MX', {
        weekday: 'long',
        day: '2-digit',
        month: 'short',
      });
      dates.push({ fullDate, label });
    }
    return dates;
  }, [branding.timezone, locale]);

  const daySlots = useMemo(() => {
    if (!selectedService) return [];
    return buildDaySlots({
      dbConfig,
      selectedDate,
      equipmentName: selectedService.name,
      service: selectedService,
      dbAppointments,
      dbBlockedSlots,
      timezone: branding.timezone,
      duration: selectedService.duration || PUBLIC_SESSION.duration,
      buffer: selectedService.buffer ?? PUBLIC_SESSION.buffer,
    });
  }, [dbConfig, selectedDate, selectedService, dbAppointments, dbBlockedSlots, branding.timezone]);

  const availableCount = countAvailableSlots(daySlots);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/public/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicName,
          portalTag,
          locale,
          formData: {
            ...formData,
            promoterCode: normalizePromoCode(formData.promoterCode),
          },
          selectedService,
          selectedDate,
          selectedTime,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (result.error === 'PHONE_LENGTH') {
          alert(t.phoneError);
          return;
        }
        throw new Error(result.error || t.genericError);
      }

      const notifyType = resolveAppointmentNotifyType({
        isNewPatient: result.patient.isNew,
        patientName: result.patient.displayName,
        appointments: dbAppointments,
      });

      if (isAutoNotifyEnabled(dbConfig || {}, notifyType)) {
        try {
          const notifyData = await sendAppointmentNotification({
            patientName: result.patient.displayName,
            phone: result.patient.phone,
            email: (formData.email || result.patient.email || '').trim(),
            date: selectedDate,
            time: selectedTime,
            equipment: selectedService.name,
            clinicName,
            clinicDisplayName: dbConfig?.name || branding.title,
            instructions: resolveSessionInstructions(formData.notes, dbConfig || {}, locale),
            instructionsLabel: getSessionInstructionsLabel(dbConfig || {}, locale),
            address: dbConfig?.address || '',
            mapsUrl: dbConfig?.maps_url || '',
            clinicPhone: dbConfig?.phone || '',
            ticketMessage: dbConfig?.ticket_message || '',
            locale,
            durationMins: Number(selectedService?.duration) || 60,
            bufferMins: Number(selectedService?.buffer ?? 30),
            notifyEnabled: true,
            notifyType,
            emailTemplates: dbConfig || {},
            sendEmail: dbConfig?.notify_channel_email !== false,
            sendSms: dbConfig?.notify_channel_sms !== false,
          });
          if (notifyHadFailure(notifyData.report)) {
            console.warn('Booking notify partial failure', notifyData.report);
          }
        } catch (notifyError) {
          console.warn('Booking notify failed', notifyError);
        }
      }

      if (dbConfig?.notify_staff_on_booking === true) {
        try {
          await notifyStaffNewBooking({
            companyConfig: dbConfig,
            clinicName,
            clinicDisplayName: dbConfig?.name || branding.title,
            patientName: result.patient.displayName,
            date: selectedDate,
            time: selectedTime,
            equipment: selectedService.name,
            locale,
            source: activePromoter.code ? 'promoter' : 'public',
            promoterCode: activePromoter.code || '',
          });
        } catch (staffErr) {
          console.warn('Staff alert failed', staffErr);
        }
      }

      setStep(4);
    } catch (error) {
      alert(error.message || t.genericError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const promoterDisplayName = activePromoter.name
    || (activePromoter.code ? t.promoterUnknown : null);

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 flex flex-col">
      {activePromoter.code && (
        <div className="bg-gradient-to-r from-amber-500 via-amber-500 to-orange-600 text-white px-4 py-4 shadow-md">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-100">
            {t.promoterPageLabel}
          </p>
          <p className="text-xs font-bold uppercase text-amber-50/90 mt-0.5">{t.promoterWith}</p>
          <h2 className="text-2xl sm:text-3xl font-black leading-tight mt-1">
            {promoterDisplayName}
          </h2>
          <p className="text-[11px] font-bold mt-2 text-amber-100">
            {t.promoterCode}: {activePromoter.code}
            {!activePromoter.recognized && (
              <span className="ml-2 opacity-80">({t.promoterPending})</span>
            )}
          </p>
        </div>
      )}

      <header className="bg-slate-900 text-white p-4 flex items-center justify-between shadow-lg gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/1c3300f3-f5e7-4682-b627-257e868ed467.jpg"
            className="h-10 w-auto bg-white rounded p-1 shrink-0"
            alt=""
          />
          <div className="min-w-0">
            <h1 className="text-sm font-black uppercase tracking-widest truncate">{branding.title}</h1>
            <p className={`text-[9px] font-bold uppercase ${accentText}`}>{branding.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/"
            className="text-[9px] font-black uppercase border border-amber-500/60 text-amber-200 px-2 py-1 rounded whitespace-nowrap"
          >
            {t.staff}
          </a>
          {step > 1 && step < 4 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="text-[10px] font-black uppercase border border-slate-700 px-3 py-1 rounded"
            >
              {t.back}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8 flex justify-center">
        <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden h-fit">
          {isLoading && step < 4 && (
            <p className="p-8 text-center text-sm font-bold text-slate-400 uppercase">{t.loading}</p>
          )}

          <div className="p-6 md:p-10">
            {step === 1 && !isLoading && (
              <div className="space-y-4">
                <h2 className="text-2xl font-black text-slate-800 uppercase text-center mb-2">
                  {t.step1Title}
                </h2>
                {activePromoter.code && (
                  <p className="text-center text-sm font-bold text-amber-700 mb-4">
                    {t.bookingWith(promoterDisplayName)}
                  </p>
                )}
                {dbServices.map((srv) => (
                  <button
                    key={srv.id}
                    type="button"
                    onClick={() => {
                      setSelectedService(srv);
                      setStep(2);
                    }}
                    className={`w-full bg-white border-2 border-slate-200 rounded-2xl p-5 flex justify-between items-center transition hover:border-2 ${
                      branding.accent === 'emerald' ? 'hover:border-emerald-500' : 'hover:border-blue-500'
                    }`}
                  >
                    <span className="font-black text-slate-800 uppercase text-left">{srv.name}</span>
                    <span className="bg-slate-100 p-2 rounded-full shrink-0">▶</span>
                  </button>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <h2 className="text-xl font-black text-slate-800 uppercase border-b pb-4">
                  {t.step2Title}
                </h2>
                {selectedService && (
                  <p className="text-xs font-bold text-slate-500 uppercase">
                    {selectedService.name}
                  </p>
                )}

                <div className="flex gap-3 overflow-x-auto pb-2">
                  {dateOptions.map((d) => (
                    <button
                      key={d.fullDate}
                      type="button"
                      onClick={() => {
                        setSelectedDate(d.fullDate);
                        setSelectedTime('');
                      }}
                      className={`shrink-0 w-32 p-4 rounded-2xl border-2 transition text-left ${
                        selectedDate === d.fullDate
                          ? `${accentBorder} bg-slate-50 ring-2 ${accentRing}`
                          : 'border-slate-200'
                      }`}
                    >
                      <p className="text-xs font-black uppercase text-slate-600 leading-tight">
                        {d.label}
                      </p>
                    </button>
                  ))}
                </div>

                {selectedDate && (
                  <>
                    <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        {t.slotLegendAvailable}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-500 border border-slate-200">
                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                        {t.slotLegendOccupied}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 text-red-700 border border-red-100">
                        <span className="w-2 h-2 rounded-full bg-red-400" />
                        {t.slotLegendBlocked}
                      </span>
                    </div>

                    <p className="text-xs font-bold text-slate-600">{t.availableCount(availableCount)}</p>

                    <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                      {daySlots.map((slot) => {
                        const statusLabels = PUBLIC_SLOT_STATUS[locale] || PUBLIC_SLOT_STATUS.es;
                        if (slot.status === 'available') {
                          return (
                            <button
                              key={slot.time}
                              type="button"
                              onClick={() => {
                                setSelectedTime(slot.time);
                                setStep(3);
                              }}
                              className="p-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 font-black text-xs uppercase text-emerald-900 hover:border-emerald-500 hover:bg-emerald-100 transition"
                            >
                              {slot.time}
                            </button>
                          );
                        }
                        return (
                          <div
                            key={slot.time}
                            className="p-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs uppercase text-slate-400 text-center cursor-not-allowed"
                            title={statusLabels[slot.status] || slot.status}
                          >
                            <span className="block opacity-60 line-through decoration-slate-400">
                              {slot.time}
                            </span>
                            <span className="block text-[8px] font-black mt-0.5 normal-case">
                              {statusLabels[slot.status] || '—'}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {availableCount === 0 && (
                      <p className="text-center text-slate-500 font-bold text-sm py-2">{t.noSlotsDay}</p>
                    )}
                  </>
                )}
              </div>
            )}

            {step === 3 && (
              <form onSubmit={handleSubmit} className="space-y-5">
                <h2 className="text-xl font-black text-slate-800 uppercase border-b pb-4">
                  {t.step3Title}
                </h2>

                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-sm space-y-1">
                  <p className="text-[10px] font-black uppercase text-slate-400">{t.step3Summary}</p>
                  <p className="font-bold text-slate-800">{selectedService?.name}</p>
                  <p className="font-bold text-slate-600">
                    {selectedDate} · {selectedTime}
                  </p>
                  {activePromoter.code && (
                    <p className="font-bold text-amber-700 text-xs uppercase pt-1">
                      {t.promoterWith}: {promoterDisplayName} ({activePromoter.code})
                    </p>
                  )}
                </div>

                <input
                  required
                  placeholder={t.name}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-4 border-2 rounded-xl font-bold uppercase outline-none focus:border-blue-500"
                />
                <div className="flex gap-2">
                  <input
                    required
                    placeholder={branding.defaultLada}
                    value={formData.lada}
                    onChange={(e) => setFormData({ ...formData, lada: e.target.value })}
                    className="w-20 p-4 border-2 bg-slate-50 rounded-xl font-black text-center outline-none focus:border-blue-500"
                  />
                  <input
                    required
                    type="tel"
                    maxLength={10}
                    placeholder={t.phone}
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })
                    }
                    className="flex-1 p-4 border-2 rounded-xl font-bold outline-none focus:border-blue-500"
                  />
                </div>
                <input
                  required
                  type="email"
                  placeholder={t.email}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full p-4 border-2 rounded-xl font-bold outline-none focus:border-blue-500"
                />

                {!promoFromLink && (
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1 ml-1">
                      {t.promoterOptional}
                    </label>
                    <input
                      placeholder="ANA01"
                      value={formData.promoterCode}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          promoterCode: e.target.value.toUpperCase(),
                        })
                      }
                      className="w-full p-3 border-2 rounded-xl font-bold uppercase outline-none focus:border-amber-500 tracking-wider"
                    />
                    <p className="text-[9px] text-slate-400 font-bold mt-1 ml-1">{t.promoterOptionalHint}</p>
                  </div>
                )}

                <section className="rounded-2xl border-2 border-amber-200 bg-amber-50/80 p-4 space-y-2">
                  <label className="block text-sm font-black uppercase text-amber-900">
                    {t.commentsTitle}
                  </label>
                  <p className="text-xs font-semibold text-amber-800/90 leading-relaxed">{t.commentsHint}</p>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder={t.commentsPlaceholder}
                    rows={4}
                    className="w-full p-4 border-2 border-amber-200 rounded-xl font-medium text-slate-800 outline-none focus:border-amber-500 bg-white resize-y min-h-[100px]"
                  />
                </section>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full ${accentBg} text-white font-black py-5 rounded-2xl uppercase shadow-xl disabled:opacity-60`}
                >
                  {isSubmitting ? t.processing : t.confirm}
                </button>
                <p className="text-[10px] text-center font-bold text-slate-400 uppercase">{t.phoneRule}</p>
              </form>
            )}

            {step === 4 && (
              <div className="text-center py-10">
                <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">
                  ✓
                </div>
                <h2 className="text-3xl font-black text-slate-800 uppercase">{t.doneTitle}</h2>
                <p className="text-sm font-bold text-slate-500 mt-4">{t.doneBody}</p>
                {formData.notes.trim() && (
                  <p className="text-xs text-slate-400 mt-3 max-w-sm mx-auto">{t.notesSaved}</p>
                )}
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-8 text-xs font-black text-blue-600 uppercase underline"
                >
                  {t.bookAnother}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
