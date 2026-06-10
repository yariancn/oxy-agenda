/** Normaliza texto de clínica para guardar e imprimir en mayúsculas. */
export function formatClinicField(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function formatClinicPhone(value) {
  return String(value ?? '').trim();
}
