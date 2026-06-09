'use client';

import {
  buildAppointmentAriaLabel,
  isCompactColumn,
  isUltraCompactColumn,
  getPatientInitials,
} from '../lib/calendarDisplay';
import { translateCheckInStatus } from '../lib/i18n';

function StatusBadge({ status, locale, compact }) {
  if (!status || status === 'Agendado') return null;

  let badgeClass = '';
  let icon = '';
  if (status === 'Llegó') { badgeClass = 'bg-amber-200 text-amber-900'; icon = '🚶'; }
  if (status === 'En Sesión') { badgeClass = 'bg-emerald-200 text-emerald-900'; icon = '🟢'; }
  if (status === 'Finalizado') { badgeClass = 'bg-slate-300 text-slate-700'; icon = '✔️'; }
  if (status === 'No Asistió' || status === 'Cancelado') { badgeClass = 'bg-red-200 text-red-900'; icon = '❌'; }
  if (status === 'Falta Justificada') { badgeClass = 'bg-orange-200 text-orange-900'; icon = '📋'; }
  if (status === 'Devuelto') { badgeClass = 'bg-purple-200 text-purple-900'; icon = '↩️'; }

  return (
    <span title={status} className={`text-[8px] font-black px-0.5 rounded shadow-sm flex items-center gap-0.5 shrink-0 ${badgeClass}`}>
      {icon}
      {!compact && <span className="hidden sm:inline">{translateCheckInStatus(locale, status)}</span>}
    </span>
  );
}

function FlagIcons({ app, ultra }) {
  const size = ultra ? 'text-[8px]' : 'text-[9px]';
  return (
    <span className={`flex items-center gap-0.5 leading-none ${size}`} aria-hidden="true">
      {app.is_new_patient && <span title="Nueva">⭐</span>}
      {app.outside_normal_hours && <span title="Fuera de horario">🟡</span>}
      {app.is_extended_block && <span title="Extendida">🟣</span>}
    </span>
  );
}

export default function CalendarAppointmentBlock({
  app,
  colWidth,
  locale,
  L,
  isSelected,
  colorClasses,
  topPx,
  paddingClass = 'left-1 right-1',
  roundedClass = 'rounded-lg',
  calculateEndTime,
  onSelect,
  onDragStart,
  draggable,
}) {
  const duration = Number(app.duration) || 60;
  const buffer = Number(app.buffer) || 0;
  const blockMins = duration + buffer;
  const heightPx = blockMins * 1.5;
  const ultra = isUltraCompactColumn(colWidth);
  const compact = isCompactColumn(colWidth);
  const shortBlock = blockMins <= 40;
  const ariaLabel = buildAppointmentAriaLabel(app, {
    localeLabels: {
      newPatient: 'Nueva',
      outsideHours: L.p.appt.badgeOutsideHours,
      extended: L.p.appt.badgeExtended,
    },
  });

  const timeLabel = duration >= 40 && !ultra
    ? `${app.time} - ${calculateEndTime(app.time, app.duration)}`
    : app.time;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={onSelect}
      draggable={draggable}
      onDragStart={onDragStart}
      className={`absolute ${paddingClass} p-0.5 sm:p-1 ${roundedClass} border-l-4 shadow-md cursor-pointer overflow-hidden flex flex-col group transition-all hover:brightness-105 hover:ring-1 hover:ring-black/20 hover:z-30 ${colorClasses} ${isSelected ? 'ring-2 ring-blue-600 ring-offset-1 z-30' : ''}`}
      style={{ top: `${topPx}px`, height: `${heightPx}px`, zIndex: 10 }}
    >
      {ultra ? (
        <div className="flex flex-col items-center justify-start h-full py-0.5 gap-0.5 text-center">
          <span className="text-[6px] font-black uppercase leading-none opacity-80">{app.time.replace(' AM', 'a').replace(' PM', 'p')}</span>
          <span className="text-[8px] font-black uppercase leading-none">{getPatientInitials(app.patient)}</span>
          <FlagIcons app={app} ultra />
          <StatusBadge status={app.check_in_status} locale={locale} compact />
        </div>
      ) : (
        <>
          <div className="flex justify-between items-start gap-0.5 mb-0.5 min-w-0">
            <span className={`font-black uppercase bg-black/10 px-0.5 rounded leading-none truncate ${compact ? 'text-[6px]' : 'text-[7px]'}`}>
              {timeLabel}
            </span>
            <StatusBadge status={app.check_in_status} locale={locale} compact={compact} />
          </div>

          {compact ? (
            <div className="flex items-center gap-0.5 min-w-0">
              <span className={`font-black uppercase leading-none shrink-0 ${shortBlock ? 'text-[7px]' : 'text-[8px]'}`}>
                {getPatientInitials(app.patient)}
              </span>
              <span className={`font-black uppercase truncate leading-none flex-1 min-w-0 ${shortBlock ? 'text-[7px]' : 'text-[8px]'}`}>
                {app.patient.split(/\s+/)[0]}
              </span>
              <FlagIcons app={app} ultra={false} />
            </div>
          ) : (
            <>
              <div className={`font-black uppercase truncate leading-none ${shortBlock ? 'text-[8px]' : 'text-[10px]'}`}>
                {app.is_new_patient ? '⭐ ' : ''}{app.patient}
              </div>
              {blockMins > 45 && (
                <div className="text-[7px] font-bold opacity-70 uppercase truncate mt-0.5">
                  {duration}m + {buffer}m {compact ? 'L.' : 'Lmpz.'}
                </div>
              )}
              {(app.outside_normal_hours || app.is_extended_block) && (
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {app.outside_normal_hours && (
                    <span className={`font-black uppercase bg-amber-200 text-amber-900 px-0.5 rounded ${compact ? 'text-[5px]' : 'text-[6px]'}`}>
                      {L.p.appt.badgeOutsideHours}
                    </span>
                  )}
                  {app.is_extended_block && (
                    <span className={`font-black uppercase bg-violet-200 text-violet-900 px-0.5 rounded ${compact ? 'text-[5px]' : 'text-[6px]'}`}>
                      {L.p.appt.badgeExtended}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
