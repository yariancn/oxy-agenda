/** Persist bitácora signature if seal fails (session expired) so it can be retried. */

const STORAGE_KEY = 'oxy_pending_bitacora_seal_v1';

export function savePendingBitacoraSeal(entry) {
  if (typeof window === 'undefined') return;
  const appointmentId = String(entry?.appointmentId || '');
  const signature = String(entry?.signature || '');
  if (!appointmentId || !signature.startsWith('data:image')) return;
  try {
    const payload = {
      appointmentId,
      clinic: entry.clinic || '',
      signature,
      vitals: entry.vitals || { pa: '', temp: '', hr: '' },
      skipCharge: !!entry.skipCharge,
      attendant: entry.attendant || '',
      patient: entry.patient || '',
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function loadPendingBitacoraSeal({ appointmentId = null, clinic = null } = {}) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.signature || !data?.appointmentId) return null;
    // Discard after 24h
    if (data.savedAt && Date.now() - Number(data.savedAt) > 24 * 60 * 60 * 1000) {
      clearPendingBitacoraSeal();
      return null;
    }
    if (appointmentId && String(data.appointmentId) !== String(appointmentId)) return null;
    if (clinic && data.clinic && String(data.clinic) !== String(clinic)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearPendingBitacoraSeal(appointmentId = null) {
  if (typeof window === 'undefined') return;
  try {
    if (appointmentId) {
      const cur = loadPendingBitacoraSeal();
      if (cur && String(cur.appointmentId) !== String(appointmentId)) return;
    }
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
