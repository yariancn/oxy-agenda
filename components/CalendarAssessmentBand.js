'use client';

import { ASSESSMENT_BAND_HEIGHT_PX, buildAppointmentAriaLabel } from '../lib/calendarDisplay';

/**
 * Franja horizontal de valoraciones — no ocupa columna de equipo.
 * Se muestra solo en días que tienen al menos una valoración agendada.
 */
export default function CalendarAssessmentBand({
  appointments = [],
  locale,
  L,
  calculateEndTime,
  onSelect,
  label = 'Valoración',
  reserveWhenEmpty = false,
}) {
  if (!appointments.length && !reserveWhenEmpty) return null;

  return (
    <div
      className="border-t border-fuchsia-300 bg-fuchsia-50/90 flex items-stretch gap-1 px-1 overflow-x-auto shrink-0"
      style={{ height: `${ASSESSMENT_BAND_HEIGHT_PX}px`, minHeight: `${ASSESSMENT_BAND_HEIGHT_PX}px` }}
      role="list"
      aria-label={label}
    >
      {appointments.length > 0 ? (
        <>
          <span className="text-[7px] font-black uppercase text-fuchsia-800 self-center shrink-0 px-0.5 leading-none">
            V.
          </span>
          {appointments.map((app) => {
        const duration = Number(app.duration) || 45;
        const buffer = Number(app.buffer) || 0;
        const blockMins = duration + buffer;
        const ariaLabel = buildAppointmentAriaLabel(app, {
          localeLabels: {
            newPatient: 'Nueva',
            outsideHours: L?.p?.appt?.badgeOutsideHours,
            extended: L?.p?.appt?.badgeExtended,
          },
        });
        return (
          <button
            key={app.id}
            type="button"
            role="listitem"
            title={ariaLabel}
            aria-label={ariaLabel}
            onClick={() => onSelect?.(app)}
            className="flex items-center gap-1 min-w-0 max-w-full shrink-0 rounded border-2 border-dashed border-fuchsia-400 bg-fuchsia-100 hover:bg-fuchsia-200 px-1.5 py-0.5 text-left transition shadow-sm"
          >
            <span className="text-[7px] font-black text-fuchsia-900 uppercase leading-none shrink-0">
              {app.time}
            </span>
            <span className="text-[8px] font-black text-fuchsia-950 uppercase truncate leading-tight">
              {app.patient}
            </span>
            {blockMins >= 40 && (
              <span className="hidden sm:inline text-[6px] font-bold text-fuchsia-700 uppercase shrink-0">
                · {calculateEndTime?.(app.time, blockMins)}
              </span>
            )}
          </button>
        );
      })}
        </>
      ) : (
        <span className="text-[7px] font-bold text-fuchsia-300/80 uppercase self-center px-1 leading-none">
          —
        </span>
      )}
    </div>
  );
}
