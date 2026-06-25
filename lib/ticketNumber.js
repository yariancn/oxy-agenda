export const TICKET_NUMBER_START = 793;

export function parseTicketNumber(value) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Highest ticket # already stored in patients.package_history. */
export function maxTicketFromHistories(patients = []) {
  let max = 0;
  for (const patient of patients) {
    const history = patient.package_history || patient.packageHistory || [];
    for (const tx of history) {
      const n = parseTicketNumber(tx.ticketNumber ?? tx.ticket_number);
      if (n && n > max) max = n;
    }
  }
  return max;
}

export function resolveNextTicketNumber({ ticketCounter, patients = [] }) {
  const fromConfig = parseTicketNumber(ticketCounter);
  const fromHistory = maxTicketFromHistories(patients);
  const floor = TICKET_NUMBER_START - 1;
  const base = Math.max(fromConfig ?? 0, fromHistory, floor);
  return base + 1;
}
