'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  attendeeConfirmStats,
  buildCapacitacionConfirmationSms,
  buildCapacitacionReminderSms,
  emptyCapacitacionDraft,
  newAttendeeId,
  normalizeAttendees,
} from '../lib/capacitaciones';

const TIME_PRESETS = [
  '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM',
];

function mergePendingAttendee(attendees, nameRaw, phoneRaw) {
  const name = String(nameRaw || '').trim();
  const phone = String(phoneRaw || '').trim();
  const list = normalizeAttendees(attendees);
  if (!name && !phone) return list;
  const phoneKey = phone.replace(/\D/g, '').slice(-10);
  const dup = list.some((a) => {
    const aPhone = String(a.phone || '').replace(/\D/g, '').slice(-10);
    return (phoneKey && aPhone && aPhone === phoneKey)
      || (name && String(a.name || '').toLowerCase() === name.toLowerCase() && (!phoneKey || aPhone === phoneKey));
  });
  if (dup) return list;
  return [
    ...list,
    {
      id: newAttendeeId(),
      name: name || phone,
      phone,
      email: '',
      confirmation_status: 'none',
    },
  ];
}

export default function CapacitacionModal({
  open,
  initial,
  clinicName,
  locale = 'es',
  clinicPhone = '',
  saving = false,
  notifying = false,
  onClose,
  onSave,
  onDelete,
  onNotify,
}) {
  const en = locale === 'en';
  const [draft, setDraft] = useState(() => emptyCapacitacionDraft({ clinic: clinicName }));
  const [attendeeName, setAttendeeName] = useState('');
  const [attendeePhone, setAttendeePhone] = useState('');
  const [error, setError] = useState('');
  const [savedFlash, setSavedFlash] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setSavedFlash('');
    setAttendeeName('');
    setAttendeePhone('');
    if (initial?.id || initial?.title || initial?.full_date) {
      setDraft({
        ...emptyCapacitacionDraft({ clinic: clinicName, fullDate: initial.full_date }),
        ...initial,
        attendees: normalizeAttendees(initial.attendees),
      });
    } else {
      setDraft(emptyCapacitacionDraft({
        clinic: clinicName,
        fullDate: initial?.full_date || '',
      }));
    }
  }, [open, initial?.id, initial?.full_date, initial?.updated_at, clinicName]);

  const attendees = useMemo(
    () => normalizeAttendees(draft.attendees),
    [draft.attendees],
  );
  const stats = useMemo(() => attendeeConfirmStats(attendees), [attendees]);

  const smsPreviewName = attendees[0]?.name || (en ? 'Name' : 'Nombre');
  const confirmationPreview = buildCapacitacionConfirmationSms({
    attendeeName: smsPreviewName,
    title: draft.title || (en ? 'Training title' : 'Título del curso'),
    fullDate: draft.full_date,
    startTime: draft.start_time,
    endTime: draft.end_time,
    location: draft.location,
    clinicPhone,
    locale: en ? 'en' : 'es',
  });
  const reminderPreview = buildCapacitacionReminderSms({
    attendeeName: smsPreviewName,
    title: draft.title || (en ? 'Training title' : 'Título del curso'),
    fullDate: draft.full_date,
    startTime: draft.start_time,
    endTime: draft.end_time,
    location: draft.location,
    locale: en ? 'en' : 'es',
  });

  if (!open) return null;

  const addAttendee = () => {
    const next = mergePendingAttendee(draft.attendees, attendeeName, attendeePhone);
    if (next.length === normalizeAttendees(draft.attendees).length
      && !String(attendeeName || '').trim()
      && !String(attendeePhone || '').trim()) {
      return;
    }
    setDraft((prev) => ({ ...prev, attendees: next }));
    setAttendeeName('');
    setAttendeePhone('');
  };

  const removeAttendee = (id) => {
    setDraft((prev) => ({
      ...prev,
      attendees: normalizeAttendees(prev.attendees).filter((a) => a.id !== id),
    }));
  };

  const handleSave = async () => {
    setError('');
    setSavedFlash('');
    const title = String(draft.title || '').trim();
    const fullDate = String(draft.full_date || '').slice(0, 10);
    if (!title) {
      setError(en ? 'Title is required.' : 'El título es obligatorio.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fullDate)) {
      setError(en ? 'Pick a date.' : 'Elige una fecha.');
      return;
    }
    // Always flush the name/phone fields into attendees on save (common miss: typing without +).
    const nextAttendees = mergePendingAttendee(draft.attendees, attendeeName, attendeePhone);
    setDraft((prev) => ({ ...prev, attendees: nextAttendees }));
    setAttendeeName('');
    setAttendeePhone('');
    if (nextAttendees.length === 0) {
      setError(en
        ? 'Add at least one attendee (name + phone) before saving.'
        : 'Agrega al menos un asistente (nombre + teléfono) antes de guardar.');
      return;
    }
    const missingPhone = nextAttendees.some((a) => !String(a.phone || '').trim());
    if (missingPhone) {
      setError(en
        ? 'Every attendee needs a phone number to receive SMS.'
        : 'Cada asistente necesita teléfono para recibir SMS.');
      return;
    }
    await onSave?.({
      ...draft,
      title,
      full_date: fullDate,
      attendees: nextAttendees,
      clinic: clinicName,
    });
    setSavedFlash(en
      ? `Saved with ${nextAttendees.length} attendee(s). You can send confirmation SMS below.`
      : `Guardado con ${nextAttendees.length} asistente(s). Ya puedes enviar el SMS de confirmación abajo.`);
  };

  return (
    <div className="fixed inset-0 z-[12000] bg-slate-950/50 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl border border-teal-200 max-h-[92vh] flex flex-col">
        <div className="px-4 py-3 border-b border-teal-100 flex items-start justify-between gap-3 shrink-0">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-teal-700">
              {en ? 'Training / course' : 'Capacitación / curso'}
            </p>
            <h3 className="text-base font-black text-slate-900">
              {draft.id
                ? (en ? 'Edit training' : 'Editar capacitación')
                : (en ? 'New training' : 'Nueva capacitación')}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
              {en
                ? 'Full-day course control — does not block any equipment column.'
                : 'Control de curso de día completo — no bloquea ni ocupa columnas de equipo.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-xl leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1 min-h-0">
          <label className="block">
            <span className="text-[10px] font-black uppercase text-slate-600">{en ? 'Title' : 'Título'}</span>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold"
              placeholder={en ? 'e.g. Chamber safety training' : 'Ej. Capacitación seguridad en cámara'}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block col-span-2 sm:col-span-1">
              <span className="text-[10px] font-black uppercase text-slate-600">{en ? 'Date' : 'Fecha'}</span>
              <input
                type="date"
                value={draft.full_date || ''}
                onChange={(e) => setDraft({ ...draft, full_date: e.target.value })}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold"
              />
            </label>
            <div className="grid grid-cols-2 gap-2 col-span-2 sm:col-span-1">
              <label className="block">
                <span className="text-[10px] font-black uppercase text-slate-600">{en ? 'Start' : 'Inicio'}</span>
                <select
                  value={draft.start_time}
                  onChange={(e) => setDraft({ ...draft, start_time: e.target.value })}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-2 py-2.5 text-sm font-bold"
                >
                  {TIME_PRESETS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-black uppercase text-slate-600">{en ? 'End' : 'Fin'}</span>
                <select
                  value={draft.end_time}
                  onChange={(e) => setDraft({ ...draft, end_time: e.target.value })}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-2 py-2.5 text-sm font-bold"
                >
                  {TIME_PRESETS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>
          </div>

          <label className="block">
            <span className="text-[10px] font-black uppercase text-slate-600">{en ? 'Location' : 'Ubicación'}</span>
            <input
              value={draft.location}
              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold"
              placeholder={en ? 'Optional' : 'Opcional'}
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-black uppercase text-slate-600">{en ? 'Notes' : 'Notas'}</span>
            <textarea
              rows={2}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium"
            />
          </label>

          <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase text-teal-900">
                {en ? 'Who receives the training' : 'A quién se le da la capacitación'}
              </p>
              <p className="text-[10px] font-bold text-teal-800">
                {stats.total} · {en ? 'SMS conf.' : 'SMS conf.'}: {stats.sent} · {en ? 'reminded' : 'recordatorio'}: {stats.reminded}
              </p>
            </div>
            <p className="text-[10px] font-bold text-teal-800/90 leading-snug">
              {en
                ? 'Type name + phone, then + (or Save — pending fields are added automatically).'
                : 'Escribe nombre + teléfono y pulsa + (o Guardar: también los agrega solo).'}
            </p>
            <div className="flex gap-2">
              <input
                value={attendeeName}
                onChange={(e) => setAttendeeName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addAttendee();
                  }
                }}
                placeholder={en ? 'Name' : 'Nombre'}
                className="flex-1 border border-teal-200 rounded-lg px-2 py-2 text-xs font-bold bg-white"
              />
              <input
                value={attendeePhone}
                onChange={(e) => setAttendeePhone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addAttendee();
                  }
                }}
                placeholder={en ? 'Phone' : 'Teléfono'}
                className="w-[38%] border border-teal-200 rounded-lg px-2 py-2 text-xs font-bold bg-white"
              />
              <button
                type="button"
                onClick={addAttendee}
                className="px-3 rounded-lg bg-teal-700 text-white text-[10px] font-black uppercase"
              >
                +
              </button>
            </div>
            <ul className="space-y-1 max-h-36 overflow-y-auto">
              {attendees.map((a) => (
                <li key={a.id} className="flex items-center gap-2 bg-white rounded-lg border border-teal-100 px-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-slate-800 truncate">{a.name}</p>
                    <p className="text-[10px] font-bold text-slate-500">{a.phone || '—'}</p>
                  </div>
                  <div className="text-[8px] font-black uppercase text-teal-700 shrink-0 text-right leading-tight">
                    {a.confirmation_sent_at ? (en ? 'Conf. sent' : 'Conf. enviada') : null}
                    {a.reminder_sent_at ? <span className="block">{en ? 'Reminder' : 'Recordatorio'}</span> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAttendee(a.id)}
                    className="text-red-500 text-sm font-black px-1"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </li>
              ))}
              {!stats.total ? (
                <li className="text-[11px] text-teal-800/80 font-medium px-1">
                  {en
                    ? 'No attendees yet — they will not receive SMS until listed here.'
                    : 'Aún no hay asistentes — no recibirán SMS hasta que aparezcan aquí.'}
                </li>
              ) : null}
            </ul>
          </div>

          <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 space-y-2">
            <p className="text-[10px] font-black uppercase text-sky-900">
              {en ? 'SMS text that will be sent' : 'Texto del SMS que se envía'}
            </p>
            <div>
              <p className="text-[9px] font-black uppercase text-sky-800 mb-1">
                {en ? 'Confirmation' : 'Confirmación'}
              </p>
              <p className="text-[11px] font-medium text-slate-800 leading-relaxed bg-white border border-sky-100 rounded-lg px-2.5 py-2 whitespace-pre-wrap">
                {confirmationPreview}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-amber-800 mb-1">
                {en ? 'Reminder' : 'Recordatorio'}
              </p>
              <p className="text-[11px] font-medium text-slate-800 leading-relaxed bg-white border border-amber-100 rounded-lg px-2.5 py-2 whitespace-pre-wrap">
                {reminderPreview}
              </p>
            </div>
            {clinicPhone ? (
              <p className="text-[9px] text-sky-800/80 font-medium">
                {en ? 'Clinic phone in confirmation SMS:' : 'Teléfono clínica en SMS de confirmación:'} {clinicPhone}
              </p>
            ) : null}
          </div>

          {savedFlash ? <p className="text-xs font-bold text-emerald-700">{savedFlash}</p> : null}
          {error ? <p className="text-xs font-bold text-red-600">{error}</p> : null}
        </div>

        <div className="p-4 border-t border-slate-100 space-y-2 shrink-0">
          {draft.id && stats.total > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={notifying || saving}
                onClick={() => onNotify?.('confirmation', { ...draft, attendees })}
                className="bg-sky-600 hover:bg-sky-700 text-white rounded-xl py-2.5 text-[10px] font-black uppercase disabled:opacity-60"
              >
                {notifying ? (en ? 'Sending…' : 'Enviando…') : (en ? 'Send confirmations' : 'Enviar confirmaciones')}
              </button>
              <button
                type="button"
                disabled={notifying || saving}
                onClick={() => onNotify?.('reminder', { ...draft, attendees })}
                className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl py-2.5 text-[10px] font-black uppercase disabled:opacity-60"
              >
                {notifying ? (en ? 'Sending…' : 'Enviando…') : (en ? 'Send reminders' : 'Enviar recordatorios')}
              </button>
            </div>
          ) : null}
          <div className="flex gap-2">
            {draft.id ? (
              <button
                type="button"
                disabled={saving || notifying}
                onClick={() => onDelete?.(draft)}
                className="px-3 rounded-xl border border-red-200 text-red-700 text-[10px] font-black uppercase hover:bg-red-50 disabled:opacity-60"
              >
                {en ? 'Delete' : 'Eliminar'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 text-slate-700 py-2.5 text-[10px] font-black uppercase"
            >
              {en ? 'Close' : 'Cerrar'}
            </button>
            <button
              type="button"
              disabled={saving || notifying}
              onClick={handleSave}
              className="flex-1 rounded-xl bg-teal-700 hover:bg-teal-800 text-white py-2.5 text-[10px] font-black uppercase disabled:opacity-60"
            >
              {saving ? (en ? 'Saving…' : 'Guardando…') : (en ? 'Save' : 'Guardar')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
