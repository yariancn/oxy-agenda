/** Valoración / evaluación: sin costo de sesión, no cartera ni adeudo. */
export function isAssessmentService(name) {
  return /valoraci[oó]n/i.test(String(name || '').trim());
}

export function skipsSessionPool(equipmentOrServiceName) {
  return isAssessmentService(equipmentOrServiceName);
}
