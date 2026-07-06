import { isClinicOpenOnDate } from './clinicWeeklySchedule.js';
import { getAppointmentSlotBlockReason, getMinutes } from './publicBookingSlots.js';
import { getServiceScheduleBounds } from './serviceSchedule.js';

/**
 * @returns {{ selectable: boolean, reason: 'closed' | 'occupied' | 'blocked' | 'outside_hours' | 'incomplete' | null }}
 */
export function getRepeatDateAvailability({
  isoDate,
  companyConfig,
  service,
  equipment,
  time,
  duration = 60,
  buffer = 0,
  appointments = [],
  blockedSlots = [],
  outsideNormalHours = false,
}) {
  if (!isoDate) return { selectable: false, reason: 'incomplete' };

  if (!outsideNormalHours && companyConfig && !isClinicOpenOnDate(companyConfig, isoDate)) {
    return { selectable: false, reason: 'closed' };
  }

  if (!time || !equipment) {
    return { selectable: false, reason: 'incomplete' };
  }

  const blockReason = getAppointmentSlotBlockReason({
    time,
    equipment,
    full_date: isoDate,
    duration,
    buffer,
    appointments,
    blockedSlots,
  });
  if (blockReason === 'occupied') return { selectable: false, reason: 'occupied' };
  if (blockReason === 'blocked') return { selectable: false, reason: 'blocked' };

  if (!outsideNormalHours && companyConfig) {
    const { startMins, endMins } = getServiceScheduleBounds(service || {}, companyConfig, isoDate);
    const start = getMinutes(time);
    const end = start + (Number(duration) || 60) + (Number(buffer) || 0);
    if (start < startMins || end > endMins) {
      return { selectable: false, reason: 'outside_hours' };
    }
  }

  return { selectable: true, reason: null };
}
