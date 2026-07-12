import { isShenandoah } from './clinicRegistry.js';

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function activeServices(services = []) {
  return (services || []).filter((s) => s.is_active !== false);
}

/** Cámara mencionada en texto OCR/WhatsApp, si existe en catálogo. */
export function extractEquipmentFromText(text, services = []) {
  const blob = normalizeKey(text);
  const match = blob.match(/camara\s*(\d+)|chamber\s*(\d+)/);
  const num = match ? (match[1] || match[2]) : null;
  if (!num) return '';

  const active = activeServices(services);
  const candidates = active.filter((s) => {
    const name = normalizeKey(s.name);
    return name.includes(`camara ${num}`) || name.includes(`camara${num}`) || name.includes(`chamber ${num}`);
  });

  if (candidates.length === 1) return candidates[0].name;
  if (candidates.length > 1) {
    return candidates.find((s) => !normalizeKey(s.name).includes('valoracion'))?.name || candidates[0].name;
  }
  return '';
}

/** Default por clínica: GDL → cámara 2, Houston → cámara 1. */
export function defaultEquipmentForClinic(clinic, services = []) {
  const active = activeServices(services);
  if (!active.length) return '';

  const preferredNum = isShenandoah(clinic) ? '1' : '2';
  const byNum = extractEquipmentFromText(`camara ${preferredNum}`, active);
  if (byNum) return byNum;

  const pattern = isShenandoah(clinic)
    ? /chamber\s*1|camara\s*1|camara1/
    : /chamber\s*2|camara\s*2|camara2/;

  const match = active.find((s) => pattern.test(normalizeKey(s.name)));
  return match?.name || active[0]?.name || '';
}

/** OCR explícito gana; si no, default de la clínica. */
export function resolveScreenshotEquipment({ clinic, services = [], ocrText = '' } = {}) {
  const fromOcr = extractEquipmentFromText(ocrText, services);
  if (fromOcr) return fromOcr;
  return defaultEquipmentForClinic(clinic, services);
}
