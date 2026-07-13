/** Campos obligatorios para guardar una cita nueva. */
export function getMissingAppointmentFields(slot, locale = 'es') {
  const missing = [];
  if (!String(slot?.patient || '').trim()) {
    missing.push(locale === 'en' ? 'patient name' : 'nombre del paciente');
  }
  if (!String(slot?.equipment || '').trim()) {
    missing.push(locale === 'en' ? 'service / camera' : 'servicio / cámara');
  }
  if (!String(slot?.time || '').trim()) {
    missing.push(locale === 'en' ? 'time' : 'hora');
  }
  return missing;
}

export function isAppointmentDraftComplete(slot) {
  return getMissingAppointmentFields(slot).length === 0;
}
