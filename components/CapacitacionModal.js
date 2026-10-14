'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  attendeeConfirmStats,
  buildCapacitacionConfirmationSms,
  buildCapacitacionEmail,
  buildCapacitacionReminderSms,
  emptyCapacitacionDraft,
  newAttendeeId,
  normalizeAttendeeEmail,
  normalizeAttendees,
} from '../lib/capacitaciones';

const TIME_PRESETS = [
  '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM',
];

function mergePendingAttendee(attendees, nameRaw, phoneRaw, emailRaw) {
  const name = String(nameRaw || '').trim();
  const phone = String(phoneRaw || '').trim();
  const email = normalizeAttendeeEmail(emailRaw);
  const list = normalizeAttendees(attendees);
  if (!name && !phone && !email) return list;
  const phoneKey = phone.replace(/\D/g, '').slice(-10);
  const dup = list.some((a) => {
    const aPhone = String(a.phone || '').replace(/\D/g, '').slice(-10);
    const aEmail = normalizeAttendeeEmail(a.email);
    if (email && aEmail && aEmail === email) return true;
    if (phoneKey && aPhone && aPhone === phoneKey) return true;
    if (name && String(a.name || '').toLowerCase() === name.toLowerCase() && !phoneKey && !email) return true;
    return false;
  });
  if (dup) return list;
  return [
    ...list,
    {
      id: newAttendeeId(),
      name: name || phone || email,
      phone,
      email,
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
  clinicDisplayName = '',
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
  const [attendeeEmail, setAttendeeEmail] = useState('');
  const [error, setError] = useState('');
  const [savedFlash, setSavedFlash] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setSavedFlash('');
    setAttendeeName('');
    setAttendeePhone('');
    setAttendeeEmail('');
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

  const previewName = attendees[0]?.name || (en ? 'Name' : 'Nombre');
  const localeKey = en ? 'en' : 'es';
  const confirmationPreview = buildCapacitacionConfirmationSms({
    attendeeName: previewName,
    title: draft.title || (en ? 'Training title' : 'Título del curso'),
    fullDate: draft.full_date,
    startTime: draft.start_time,
    endTime: draft.end_time,
    location: draft.location,
    clinicPhone,
    locale: localeKey,
  });
  const reminderPreview = buildCapacitacionReminderSms({
    attendeeName: previewName,
    title: draft.title || (en ? 'Training title' : 'Título del curso'),
    fullDate: draft.full_date,
    startTime: draft.start_time,
    endTime: draft.end_time,
    location: draft.location,
    locale: localeKey,
  });
  const emailPreview = buildCapacitacionEmail({
    kind: 'confirmation',
    attendeeName: previewName,
    title: draft.title || (en ? 'Training title' : 'Título del curso'),
    fullDate: draft.full_date,
    startTime: draft.start_time,
    endTime: draft.end_time,
    location: draft.location,
    clinicDisplayName: clinicDisplayName || clinicName,
    clinicPhone,
    locale: localeKey,
  });

  if (!open) return null;

  const clearPending = () => {
    setAttendeeName('');
    setAttendeePhone('');
    setAttendeeEmail('');
  };

  const addAttendee = () => {
    const next = mergePendingAttendee(draft.attendees, attendeeName, attendeePhone, attendeeEmail);
    if (next.length === normalizeAttendees(draft.attendees).length
      && !String(attendeeName || '').trim()
      && !String(attendeePhone || '').trim()
      && !normalizeAttendeeEmail(attendeeEmail)) {
      return;
    }
    setDraft((prev) => ({ ...prev, attendees: next }));
    clearPending();
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
    const nextAttendees = mergePendingAttendee(draft.attendees, attendeeName, attendeePhone, attendeeEmail);
    setDraft((prev) => ({ ...prev, attendees: nextAttendees }));
    clearPending();
    if (nextAttendees.length === 0) {
      setError(en
        ? 'Add at least one attendee (name + phone and/or email).'
        : 'Agrega al menos un asistente (nombre + teléfono y/o correo).');
      return;
    }
    const incomplete = nextAttendees.some((a) => !String(a.phone || '').trim() && !normalizeAttendeeEmail(a.email));
    if (incomplete) {
      setError(en
        ? 'Each attendee needs a phone and/or email.'
        : 'Cada asistente necesita teléfono y/o correo.');
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
      ? `Saved with ${nextAttendees.length} attendee(s). You can send confirmation below.`
      : `Guardado con ${nextAttendees.length} asistente(s). Ya puedes enviar la confirmación abajo.`);
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
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none px-1" aria-label="Close">×</button>
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
                <select value={draft.start_time} onChange={(e) => setDraft({ ...draft, start_time: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-xl px-2 py-2.5 text-sm font-bold">
                  {TIME_PRESETS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-black uppercase text-slate-600">{en ? 'End' : 'Fin'}</span>
                <select value={draft.end_time} onChange={(e) => setDraft({ ...draft, end_time: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-xl px-2 py-2.5 text-sm font-bold">
                  {TIME_PRESETS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>
          </div>

          <label className="block">
            <span className="text-[10px] font-black uppercase text-slate-600">{en ? 'Location' : 'Ubicación'}</span>
            <input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold" placeholder={en ? 'Optional' : 'Opcional'} />
          </label>

          <label className="block">
            <span className="text-[10px] font-black uppercase text-slate-600">{en ? 'Notes' : 'Notas'}</span>
            <textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium" />
          </label>

          <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase text-teal-900">
                {en ? 'Who receives the training' : 'A quién se le da la capacitación'}
              </p>
              <p className="text-[10px] font-bold text-teal-800">
                {stats.total} · SMS: {stats.sent} · {en ? 'email conf.' : 'correo conf.'}: {attendees.filter((a) => a.confirmation_email_sent_at).length}
              </p>
            </div>
            <p className="text-[10px] font-bold text-teal-800/90 leading-snug">
              {en
                ? 'Name + phone and/or email. Press + or Save to add.'
                : 'Nombre + teléfono y/o correo. Pulsa + o Guardar para agregar.'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                value={attendeeName}
                onChange={(e) => setAttendeeName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAttendee(); } }}
                placeholder={en ? 'Name' : 'Nombre'}
                className="border border-teal-200 rounded-lg px-2 py-2 text-xs font-bold bg-white"
              />
              <input
                value={attendeePhone}
                onChange={(e) => setAttendeePhone(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAttendee(); } }}
                placeholder={en ? 'Phone' : 'Teléfono'}
                className="border border-teal-200 rounded-lg px-2 py-2 text-xs font-bold bg-white"
              />
              <div className="flex gap-2">
                <input
                  value={attendeeEmail}
                  onChange={(e) => setAttendeeEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAttendee(); } }}
                  placeholder={en ? 'Email' : 'Correo'}
                  type="email"
                  className="flex-1 border border-teal-200 rounded-lg px-2 py-2 text-xs font-bold bg-white min-w-0"
                />
                <button type="button" onClick={addAttendee} className="px-3 rounded-lg bg-teal-700 text-white text-[10px] font-black uppercase shrink-0">+</button>
              </div>
            </div>
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {attendees.map((a) => (
                <li key={a.id} className="flex items-center gap-2 bg-white rounded-lg border border-teal-100 px-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-slate-800 truncate">{a.name}</p>
                    <p className="text-[10px] font-bold text-slate-500 truncate">
                      {[a.phone || null, a.email || null].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <div className="text-[8px] font-black uppercase text-teal-700 shrink-0 text-right leading-tight">
                    {a.confirmation_sent_at ? <span className="block">{en ? 'SMS sent' : 'SMS enviado'}</span> : null}
                    {a.confirmation_email_sent_at ? <span className="block">{en ? 'Email sent' : 'Correo enviado'}</span> : null}
                    {a.reminder_sent_at ? <span className="block">{en ? 'SMS rem.' : 'SMS rec.'}</span> : null}
                    {a.reminder_email_sent_at ? <span className="block">{en ? 'Email rem.' : 'Correo rec.'}</span> : null}
                  </div>
                  <button type="button" onClick={() => removeAttendee(a.id)} className="text-red-500 text-sm font-black px-1" aria-label="Remove">×</button>
                </li>
              ))}
              {!stats.total ? (
                <li className="text-[11px] text-teal-800/80 font-medium px-1">
                  {en
                    ? 'No attendees yet — they need phone and/or email to get notified.'
                    : 'Aún no hay asistentes — necesitan teléfono y/o correo para avisarles.'}
                </li>
              ) : null}
            </ul>
          </div>

          <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 space-y-2">
            <p className="text-[10px] font-black uppercase text-sky-900">
              {en ? 'Message preview' : 'Vista previa del mensaje'}
            </p>
            <div>
              <p className="text-[9px] font-black uppercase text-sky-800 mb-1">{en ? 'SMS confirmation' : 'SMS confirmación'}</p>
              <p className="text-[11px] font-medium text-slate-800 leading-relaxed bg-white border border-sky-100 rounded-lg px-2.5 py-2 whitespace-pre-wrap">{confirmationPreview}</p>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-indigo-800 mb-1">{en ? 'Email subject' : 'Asunto del correo'}</p>
              <p className="text-[11px] font-bold text-slate-800 bg-white border border-indigo-100 rounded-lg px-2.5 py-2">{emailPreview.subject}</p>
              <p className="text-[11px] font-medium text-slate-700 leading-relaxed bg-white border border-indigo-100 rounded-lg px-2.5 py-2 mt-1 whitespace-pre-wrap">{emailPreview.text}</p>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-amber-800 mb-1">{en ? 'SMS reminder' : 'SMS recordatorio'}</p>
              <p className="text-[11px] font-medium text-slate-800 leading-relaxed bg-white border border-amber-100 rounded-lg px-2.5 py-2 whitespace-pre-wrap">{reminderPreview}</p>
            </div>
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
          <p className="text-[9px] font-bold text-slate-500 leading-snug">
            {en
              ? 'Confirmation/reminder sends SMS when there is a phone, and email when there is an address.'
              : 'Confirmación/recordatorio envía SMS si hay teléfono, y correo si hay email.'}
          </p>
          <div className="flex gap-2">
            {draft.id ? (
              <button type="button" disabled={saving || notifying} onClick={() => onDelete?.(draft)} className="px-3 rounded-xl border border-red-200 text-red-700 text-[10px] font-black uppercase hover:bg-red-50 disabled:opacity-60">
                {en ? 'Delete' : 'Eliminar'}
              </button>
            ) : null}
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 text-slate-700 py-2.5 text-[10px] font-black uppercase">
              {en ? 'Close' : 'Cerrar'}
            </button>
            <button type="button" disabled={saving || notifying} onClick={handleSave} className="flex-1 rounded-xl bg-teal-700 hover:bg-teal-800 text-white py-2.5 text-[10px] font-black uppercase disabled:opacity-60">
              {saving ? (en ? 'Saving…' : 'Guardando…') : (en ? 'Save' : 'Guardar')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
