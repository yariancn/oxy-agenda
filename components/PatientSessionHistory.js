"use client";
import React, { useMemo } from 'react';
import { useStaffLocale } from './StaffLocaleContext';
import { translateCheckInStatus } from '../lib/i18n';
import {
  filterPatientAppointments,
  formatSessionDate,
  getCheckInStatusTone,
  sortAppointmentsNewestFirst,
} from '../lib/patientAppointmentHistory';

export default function PatientSessionHistory({
  appointments = [],
  patientName = '',
  patientId = null,
  className = '',
  maxHeightClass = 'max-h-52',
}) {
  const { locale, L } = useStaffLocale();
  const t = L.modals.patient;

  const sessions = useMemo(
    () => sortAppointmentsNewestFirst(
      filterPatientAppointments(appointments, { patientName, patientId }),
    ),
    [appointments, patientName, patientId],
  );

  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50 overflow-hidden ${className}`}>
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-100 flex justify-between items-center gap-2">
        <span className="text-[10px] font-black uppercase text-slate-600 tracking-wide">
          {t.sessionHistoryTitle}
        </span>
        <span className="text-[9px] font-bold text-slate-400 shrink-0">
          {t.sessionHistoryCount(sessions.length)}
        </span>
      </div>

      {sessions.length === 0 ? (
        <p className="p-3 text-[10px] text-slate-400 font-bold uppercase text-center">
          {t.sessionHistoryEmpty}
        </p>
      ) : (
        <ul className={`${maxHeightClass} overflow-y-auto divide-y divide-slate-100`}>
          {sessions.map((app) => {
            const status = app.check_in_status || 'Agendado';
            const tone = getCheckInStatusTone(status);
            const statusLabel = translateCheckInStatus(locale, status);
            const attendant = String(app.attendant || '').trim();

            return (
              <li key={app.id} className="px-3 py-2.5 bg-white">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-slate-800 leading-tight">
                      {formatSessionDate(app.full_date, locale)}
                      <span className="text-slate-400 font-bold mx-1">·</span>
                      <span className="text-slate-600">{app.time || '—'}</span>
                    </p>
                    <p className="text-[10px] font-black text-blue-700 uppercase truncate mt-0.5">
                      {app.equipment || '—'}
                    </p>
                    {attendant && attendant !== 'Por Asignar' ? (
                      <p className="text-[8px] font-bold text-slate-400 uppercase mt-0.5 truncate">
                        {t.sessionAttendant(attendant)}
                      </p>
                    ) : null}
                  </div>
                  <span
                    title={statusLabel}
                    className={`shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded uppercase whitespace-nowrap ${tone.className}`}
                  >
                    {tone.icon} {statusLabel}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
