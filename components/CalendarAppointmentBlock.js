'use client';

import {
  buildAppointmentAriaLabel,
  isCompactColumn,
  isUltraCompactColumn,
  getPatientInitials,
  CALENDAR_PIXELS_PER_MINUTE,
} from '../lib/calendarDisplay';
import { translateCheckInStatus } from '../lib/i18n';
import {
  CONFIRMATION_STATUS,
  confirmationStatusClass,
  confirmationStatusLabel,
} from '../lib/appointmentConfirmation';

function ConfirmationBadge({ status, locale, compact }) {
  if (!status || status === CONFIRMATION_STATUS.NONE) return null;
  const label = confirmationStatusLabel(status, locale);
  const icon = status === CONFIRMATION_STATUS.CONFIRMED ? '✅'
    : status === CONFIRMATION_STATUS.DECLINED ? '❌'
      : status === CONFIRMATION_STATUS.NO_RESPONSE ? '⚠️'
        : '⏳';
  return (
    <span
      title={label}
      className={`text-[6px] font-black px-0.5 rounded border shrink-0 ${confirmationStatusClass(status)} ${compact ? '' : 'sm:text-[7px]'}`}
    >
      {icon}{compact ? '' : ` ${label}`}
    </span>
  );
}

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
  const hasFlags = app.is_new_patient || app.outside_normal_hours || app.is_extended_block;
  if (!hasFlags) return null;

  return (
    <span className={`flex items-center justify-center gap-0.5 leading-none ${size}`} aria-hidden="true">
      {app.is_new_patient && <span title="Nueva">⭐</span>}
      {app.outside_normal_hours && <span title="Fuera de horario">🟡</span>}
      {app.is_extended_block && <span title="Extendida">🟣</span>}
    </span>
  );
}

function StackedIndicators({ app, locale, compact, ultra }) {
  const hasFlags = app.is_new_patient || app.outside_normal_hours || app.is_extended_block;
  const hasStatus = app.check_in_status && app.check_in_status !== 'Agendado';
  const hasConfirmation = app.confirmation_status && app.confirmation_status !== CONFIRMATION_STATUS.NONE;
  if (!hasFlags && !hasStatus && !hasConfirmation) return null;

  return (
    <div className={`flex items-center justify-center gap-0.5 flex-wrap ${ultra ? 'mt-0.5' : 'mt-0.5 w-full'}`}>
      <FlagIcons app={app} ultra={ultra} />
      {hasConfirmation && <ConfirmationBadge status={app.confirmation_status} locale={locale} compact={compact || ultra} />}
      {compact && hasStatus && <StatusBadge status={app.check_in_status} locale={locale} compact />}
    </div>
  );
}

function PatientName({ name, isNew, className = '' }) {
  return (
    <div
      className={`font-black uppercase leading-[1.15] line-clamp-2 break-words w-full min-w-0 ${className}`}
      title={name}
    >
      {isNew ? '⭐ ' : ''}{name}
    </div>
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
  const heightPx = blockMins * CALENDAR_PIXELS_PER_MINUTE;
  const ultra = isUltraCompactColumn(colWidth);
  const compact = isCompactColumn(colWidth);
  const shortBlock = blockMins <= 40;
  const showNameInUltra = ultra && blockMins >= 75;
  const ariaLabel = buildAppointmentAriaLabel(app, {
    localeLabels: {
      newPatient: 'Nueva',
      outsideHours: L.p.appt.badgeOutsideHours,
      extended: L.p.appt.badgeExtended,
    },
  });

  const timeLabel = duration >= 40 && !ultra
    ? `${app.time} - ${calculateEndTime(app.time, blockMins)}`
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
      className={`absolute ${paddingClass} p-0.5 sm:p-0.5 ${roundedClass} border border-l-[3px] shadow-sm cursor-pointer overflow-hidden flex flex-col group transition-all hover:brightness-[1.02] hover:ring-1 hover:ring-black/10 hover:z-30 ${colorClasses} ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1 z-30' : ''}`}
      style={{ top: `${topPx}px`, height: `${heightPx}px`, zIndex: 10 }}
    >
      {ultra ? (
        <div className="flex flex-col items-center justify-start h-full py-0.5 gap-0.5 text-center min-w-0 w-full">
          <span className="text-[6px] font-black uppercase leading-none opacity-80 shrink-0">{app.time.replace(' AM', 'a').replace(' PM', 'p')}</span>
          {showNameInUltra ? (
            <PatientName name={app.patient} isNew={app.is_new_patient} className="text-[7px] text-center" />
          ) : (
            <span className="text-[8px] font-black uppercase leading-none">{getPatientInitials(app.patient)}</span>
          )}
          <StackedIndicators app={app} locale={locale} compact ultra />
        </div>
      ) : (
        <>
          <div className="flex justify-between items-start gap-0.5 mb-0.5 min-w-0 w-full">
            <span className={`font-black uppercase bg-black/10 px-0.5 rounded leading-none truncate min-w-0 flex-1 ${compact ? 'text-[6px]' : 'text-[7px]'}`}>
              {timeLabel}
            </span>
            {!compact && (
              <div className="flex items-center gap-0.5 shrink-0">
                <ConfirmationBadge status={app.confirmation_status} locale={locale} compact />
                <StatusBadge status={app.check_in_status} locale={locale} compact={false} />
              </div>
            )}
          </div>

          {compact ? (
            <div className="flex flex-col items-stretch min-w-0 w-full flex-1 min-h-0">
              <PatientName
                name={app.patient}
                isNew={app.is_new_patient}
                className={shortBlock ? 'text-[7px]' : 'text-[8px] sm:text-[9px]'}
              />
              <StackedIndicators app={app} locale={locale} compact ultra={false} />
            </div>
          ) : (
            <>
              <PatientName
                name={app.patient}
                isNew={app.is_new_patient}
                className={shortBlock ? 'text-[8px]' : 'text-[10px]'}
              />
              {blockMins > 45 && (
                <div className="text-[7px] font-bold opacity-70 uppercase truncate mt-0.5">
                  {duration}m sesión · {blockMins}m bloque
                </div>
              )}
              {(app.outside_normal_hours || app.is_extended_block) && (
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {app.outside_normal_hours && (
                    <span className="text-[6px] font-black uppercase bg-amber-200 text-amber-900 px-0.5 rounded">
                      {L.p.appt.badgeOutsideHours}
                    </span>
                  )}
                  {app.is_extended_block && (
                    <span className="text-[6px] font-black uppercase bg-violet-200 text-violet-900 px-0.5 rounded">
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
